import { CONTRACT } from '../features/orgs/contract'
import type { Org, OrgWithId } from '../features/orgs/types'
import { isValidItemKey, normalizeName, stockId } from '../features/inventory/names'
import { MAX_QTY, type Item, type StockRow, type Warehouse } from '../features/inventory/types'
import { inSaudiBox, validateItemName } from '../features/inventory/validate'
import { applicationFields, resolveItem, ServiceError, type AuthUser, type Services } from './types'

type Seed = {
  users?: { uid: string; email: string; password: string }[]
  orgs?: Record<string, Org>
  admins?: string[]
  signedIn?: string
  items?: Item[]
  warehouses?: Record<string, Warehouse[]>
  stock?: StockRow[]
  /** Simulate backend failures in tests. */
  failures?: { isAdmin?: boolean; watchOrg?: boolean; allStock?: boolean; save?: boolean }
}

/** In-memory backend with the same transitions the security rules allow. Used by UI tests and local demos. */
export function createFakeServices(seed: Seed = {}) {
  const state = {
    users: [...(seed.users ?? [])],
    orgs: new Map<string, Org>(Object.entries(seed.orgs ?? {})),
    admins: new Set(seed.admins ?? []),
    current: null as AuthUser | null,
    clock: 0,
    items: new Map<string, Item>((seed.items ?? []).map(i => [i.key, i])),
    warehouses: new Map<string, Warehouse[]>(Object.entries(seed.warehouses ?? {})),
    stock: new Map<string, StockRow>((seed.stock ?? []).map(r => [`${r.orgId}/${r.id}`, r])),
    nextId: 0,
  }
  if (seed.signedIn) {
    const u = state.users.find(x => x.uid === seed.signedIn)
    if (u) state.current = { uid: u.uid, email: u.email }
  }
  const userCbs = new Set<(u: AuthUser | null) => void>()
  const orgCbs = new Map<string, Set<(o: Org | null) => void>>()
  const pendingCbs = new Set<(l: OrgWithId[]) => void>()

  // Strictly increasing timestamps so "oldest first" is deterministic.
  const now = () => new Date(Date.UTC(2026, 10, 24, 9, 0, 0) + ++state.clock * 1000)
  const pendingList = () =>
    [...state.orgs.entries()]
      .filter(([, o]) => o.status === 'pending')
      .map(([id, o]) => ({ ...o, id }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const emitUser = () => userCbs.forEach(cb => cb(state.current))
  const emitOrg = (uid: string) => {
    orgCbs.get(uid)?.forEach(cb => cb(state.orgs.get(uid) ?? null))
    pendingCbs.forEach(cb => cb(pendingList()))
  }
  const mustOrg = (uid: string) => {
    const o = state.orgs.get(uid)
    if (!o) throw new ServiceError('invalid-transition', 'no org')
    return o
  }
  const mustPending = (uid: string) => {
    const o = mustOrg(uid)
    if (o.status !== 'pending') throw new ServiceError('invalid-transition', 'only pending can be reviewed')
    return o
  }

  // Inventory watchers: re-run every listener after any inventory change.
  const invCbs = new Set<() => void>()
  const emitInv = () => invCbs.forEach(f => f())
  const listen = (f: () => void) => {
    invCbs.add(f)
    queueMicrotask(f)
    return () => { invCbs.delete(f) }
  }
  const rowsOf = (uid: string) => [...state.stock.values()].filter(r => r.orgId === uid)
  const mustApproved = (uid: string) => {
    if (state.orgs.get(uid)?.status !== 'approved') throw new ServiceError('invalid-transition', 'org not approved')
    if (seed.failures?.save) throw new ServiceError('network')
  }

  const services: Services = {
    auth: {
      onUserChanged(cb) {
        userCbs.add(cb)
        queueMicrotask(() => cb(state.current))
        return () => userCbs.delete(cb)
      },
      async signIn(email, password) {
        const u = state.users.find(x => x.email === email.trim() && x.password === password)
        if (!u) throw new ServiceError('wrong-credentials')
        state.current = { uid: u.uid, email: u.email }
        emitUser()
      },
      async signUp(email, password) {
        if (state.users.some(x => x.email === email.trim())) throw new ServiceError('email-in-use')
        if (password.length < 6) throw new ServiceError('weak-password')
        const user = { uid: `u${state.users.length + 1}`, email: email.trim() }
        state.users.push({ ...user, password })
        state.current = user
        emitUser()
        return user
      },
      async signOut() {
        state.current = null
        emitUser()
      },
    },
    orgs: {
      watchOrg(uid, cb, onError) {
        if (seed.failures?.watchOrg) {
          queueMicrotask(() => onError?.(new ServiceError('network')))
          return () => {}
        }
        if (!orgCbs.has(uid)) orgCbs.set(uid, new Set())
        orgCbs.get(uid)!.add(cb)
        queueMicrotask(() => cb(state.orgs.get(uid) ?? null))
        return () => orgCbs.get(uid)?.delete(cb)
      },
      async submitApplication(user, app, acceptedByName) {
        if (state.orgs.has(user.uid)) throw new ServiceError('invalid-transition', 'already applied')
        const t = now()
        state.orgs.set(user.uid, {
          ...applicationFields(app),
          status: 'pending',
          contactEmail: user.email,
          contract: { version: CONTRACT.version, acceptedAt: t, acceptedByName: acceptedByName.trim() },
          createdAt: t,
          updatedAt: t,
        } as Org)
        emitOrg(user.uid)
      },
      async resubmit(uid, app) {
        const o = mustOrg(uid)
        if (o.status !== 'rejected') throw new ServiceError('invalid-transition', 'only rejected can resubmit')
        state.orgs.set(uid, { ...o, ...applicationFields(app), role: o.role, status: 'pending', updatedAt: now() } as Org)
        emitOrg(uid)
      },
    },
    admin: {
      async isAdmin(uid) {
        if (seed.failures?.isAdmin) throw new ServiceError('network')
        return state.admins.has(uid)
      },
      watchPending(cb) {
        pendingCbs.add(cb)
        queueMicrotask(() => cb(pendingList()))
        return () => pendingCbs.delete(cb)
      },
      async approve(orgId, adminUid) {
        const o = mustPending(orgId)
        const t = now()
        state.orgs.set(orgId, { ...o, status: 'approved', reviewedBy: adminUid, reviewedAt: t, updatedAt: t })
        emitOrg(orgId)
      },
      async reject(orgId, adminUid, reason) {
        const o = mustPending(orgId)
        if (reason.trim().length < 3) throw new ServiceError('invalid-transition', 'reason required')
        const t = now()
        state.orgs.set(orgId, { ...o, status: 'rejected', rejectReason: reason.trim(), reviewedBy: adminUid, reviewedAt: t, updatedAt: t })
        emitOrg(orgId)
      },
    },
    inventory: {
      watchItems(cb) {
        return listen(() => cb([...state.items.values()]))
      },
      watchWarehouses(uid, cb) {
        return listen(() => cb([...(state.warehouses.get(uid) ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())))
      },
      watchStock(uid, cb) {
        return listen(() => cb(rowsOf(uid)))
      },
      watchAllStock(cb, onError) {
        if (seed.failures?.allStock) {
          queueMicrotask(() => onError?.(new ServiceError('network')))
          return () => {}
        }
        return listen(() => cb([...state.stock.values()].filter(r => state.orgs.get(r.orgId)?.status === 'approved')))
      },
      async saveWarehouse(owner, id, draft) {
        mustApproved(owner.uid)
        if (!inSaudiBox(draft.location)) throw new ServiceError('invalid-transition', 'outside Saudi box')
        const list = state.warehouses.get(owner.uid) ?? []
        const t = now()
        const fields = { name: draft.name.trim(), city: draft.city, district: draft.district.trim(), location: { ...draft.location } }
        let wid = id
        if (wid) {
          const i = list.findIndex(w => w.id === wid)
          if (i < 0) throw new ServiceError('invalid-transition', 'no warehouse')
          list[i] = { ...list[i], ...fields, updatedAt: t }
          for (const r of rowsOf(owner.uid))
            if (r.warehouseId === wid) state.stock.set(`${owner.uid}/${r.id}`, { ...r, warehouseName: fields.name, city: fields.city, updatedAt: t })
        } else {
          wid = `w${++state.nextId}`
          list.push({ id: wid, ...fields, createdAt: t, updatedAt: t })
        }
        state.warehouses.set(owner.uid, list)
        emitInv()
        return wid
      },
      async deleteWarehouse(uid, id) {
        mustApproved(uid)
        const rows = rowsOf(uid).filter(r => r.warehouseId === id)
        if (rows.some(r => r.reserved > 0)) throw new ServiceError('invalid-transition', 'reserved stock')
        rows.forEach(r => state.stock.delete(`${uid}/${r.id}`))
        state.warehouses.set(uid, (state.warehouses.get(uid) ?? []).filter(w => w.id !== id))
        emitInv()
      },
      async setStock(owner, warehouse, choice, condition, qty) {
        mustApproved(owner.uid)
        if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) throw new ServiceError('invalid-transition', 'bad qty')
        if (!(state.warehouses.get(owner.uid) ?? []).some(w => w.id === warehouse.id)) throw new ServiceError('invalid-transition', 'no warehouse')
        const wanted = resolveItem(choice, normalizeName)
        if (!isValidItemKey(wanted.key) || validateItemName(wanted.name)) throw new ServiceError('invalid-transition', 'bad product')
        const item = state.items.get(wanted.key) ?? wanted
        state.items.set(item.key, item)
        const id = stockId(warehouse.id, item.key, condition)
        const k = `${owner.uid}/${id}`
        const t = now()
        const existing = state.stock.get(k)
        if (existing && qty < existing.reserved) throw new ServiceError('invalid-transition', 'below reserved')
        state.stock.set(k, existing ? { ...existing, qty, updatedAt: t } : {
          id, orgId: owner.uid, orgName: owner.name, orgRole: owner.role,
          warehouseId: warehouse.id, warehouseName: warehouse.name, city: warehouse.city,
          itemId: item.key, itemName: item.name, condition, qty, reserved: 0, updatedAt: t,
        })
        emitInv()
      },
      async deleteStock(uid, id) {
        mustApproved(uid)
        const r = state.stock.get(`${uid}/${id}`)
        if (r && r.reserved > 0) throw new ServiceError('invalid-transition', 'reserved stock')
        state.stock.delete(`${uid}/${id}`)
        emitInv()
      },
    },
  }
  return Object.assign(services, { _state: state })
}
