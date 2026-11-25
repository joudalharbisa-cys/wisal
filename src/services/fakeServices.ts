import { CONTRACT } from '../features/orgs/contract'
import type { Org, OrgWithId } from '../features/orgs/types'
import { isValidItemKey, normalizeName, stockId } from '../features/inventory/names'
import { MAX_QTY, type Item, type StockRow, type Warehouse } from '../features/inventory/types'
import { inSaudiBox, validateItemName } from '../features/inventory/validate'
import { makeReceiptCode } from '../features/requests/code'
import { planReservation } from '../features/requests/reserve'
import { parsePhone, toWesternDigits } from '../features/requests/validate'
import type { Contact, HospitalRequest, Rejection } from '../features/requests/types'
import { applicationFields, resolveItem, ServiceError, type AuthUser, type Services } from './types'

type Seed = {
  users?: { uid: string; email: string; password: string }[]
  orgs?: Record<string, Org>
  admins?: string[]
  signedIn?: string
  items?: Item[]
  warehouses?: Record<string, Warehouse[]>
  stock?: StockRow[]
  requests?: HospitalRequest[]
  codes?: Record<string, string>
  contacts?: Record<string, { hospitalId: string } & Contact>
  /** Simulate backend failures in tests. */
  failures?: { isAdmin?: boolean; watchOrg?: boolean; save?: boolean; inventory?: boolean; requests?: boolean }
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
    requests: new Map<string, HospitalRequest>((seed.requests ?? []).map(r => [r.id, r])),
    codes: new Map<string, string>(Object.entries(seed.codes ?? {})),
    contacts: new Map<string, { hospitalId: string } & Contact>(Object.entries(seed.contacts ?? {})),
    history: new Map<string, { hospitalId: string; lastRejection: Rejection }>(),
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
  const listen = (f: () => void, onError?: (e: ServiceError) => void) => {
    if (seed.failures?.inventory) {
      queueMicrotask(() => onError?.(new ServiceError('network')))
      return () => {}
    }
    invCbs.add(f)
    queueMicrotask(f)
    return () => { invCbs.delete(f) }
  }
  // Requests reuse the inventory change feed; reads mirror the rules (only the owning hospital).
  const listenReq = (f: () => void, onError?: (e: ServiceError) => void) => {
    if (seed.failures?.requests) {
      queueMicrotask(() => onError?.(new ServiceError('network')))
      return () => {}
    }
    invCbs.add(f)
    queueMicrotask(f)
    return () => { invCbs.delete(f) }
  }
  /** Like the rules: the rejection leaves the request (other charities may read it) for the hospital-only history. */
  const moveRejection = (r: HospitalRequest): HospitalRequest => {
    if (!r.lastRejection) return r
    state.history.set(r.id, { hospitalId: r.hospitalId, lastRejection: r.lastRejection })
    const { lastRejection: _moved, ...rest } = r
    return rest
  }
  const mineOrNull = (id: string) => {
    const r = state.requests.get(id)
    return r && r.hospitalId === state.current?.uid ? r : null
  }
  // What the rules let the signed-in org read: its own, addressed to it, or open (approved charities).
  const readable = (id: string) => {
    const r = state.requests.get(id)
    const me = state.current?.uid
    if (!r || !me) return null
    const o = state.orgs.get(me)
    const charity = o?.role === 'charity' && o.status === 'approved'
    return r.hospitalId === me || r.charityId === me || (r.status === 0 && r.open && charity) ? r : null
  }
  const actingCharity = (c: { uid: string }) => {
    const o = state.orgs.get(c.uid)
    if (state.current?.uid !== c.uid || o?.role !== 'charity' || o.status !== 'approved') throw new ServiceError('invalid-transition', 'not an approved charity')
    return o
  }
  const actingHospital = (h: { uid: string }, id: string) => {
    const r = state.requests.get(id)
    if (state.current?.uid !== h.uid || !r || r.hospitalId !== h.uid) throw new ServiceError('invalid-transition', 'not your request')
    return r
  }
  const validPerson = (p: { name: string; phone: string; eta: Date }) => p.name.trim().length >= 2 && p.name.trim().length <= 60 && parsePhone(p.phone) === p.phone && p.eta instanceof Date
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
      watchItems(cb, onError) {
        return listen(() => cb([...state.items.values()]), onError)
      },
      watchWarehouses(uid, cb, onError) {
        return listen(() => cb([...(state.warehouses.get(uid) ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())), onError)
      },
      watchStock(uid, cb, onError) {
        return listen(() => cb(rowsOf(uid)), onError)
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
    requests: {
      watchMine(uid, cb, onError) {
        return listenReq(() => cb([...state.requests.values()].filter(r => r.hospitalId === uid).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())), onError)
      },
      watchOne(id, cb, onError) {
        return listenReq(() => cb(readable(id)), onError)
      },
      watchIncoming(charityId, cb, onError) {
        return listenReq(() => cb([...state.requests.values()].filter(r => r.charityId === charityId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())), onError)
      },
      watchOpen(cb, onError) {
        return listenReq(() => {
          const o = state.current ? state.orgs.get(state.current.uid) : undefined
          const ok = o?.role === 'charity' && o.status === 'approved'
          cb(ok ? [...state.requests.values()].filter(r => r.status === 0 && r.open).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) : [])
        }, onError)
      },
      async accept(charity, id, warehouseId) {
        const o = actingCharity(charity)
        const r = state.requests.get(id)
        const sent = !!r && r.status === 1 && r.charityId === charity.uid
        const open = !!r && r.status === 0 && r.open
        if (!r || (!sent && !open)) throw new ServiceError('invalid-transition', 'taken')
        if (!(state.warehouses.get(charity.uid) ?? []).some(w => w.id === warehouseId)) throw new ServiceError('invalid-transition', 'no warehouse')
        const plan = planReservation(r, warehouseId, rowsOf(charity.uid))
        if (!plan) throw new ServiceError('invalid-transition', 'short')
        const t = now()
        for (const [sid, n] of Object.entries(plan)) {
          const k = `${charity.uid}/${sid}`
          const row = state.stock.get(k)!
          state.stock.set(k, { ...row, reserved: row.reserved + n, updatedAt: t })
        }
        const next: HospitalRequest = { ...r, status: 2, open: false, charityId: charity.uid, charityName: o.name, warehouseId, reservation: plan, acceptedAt: t, updatedAt: t }
        state.requests.set(id, next)
        emitInv()
      },
      async reject(charity, id, reason) {
        actingCharity(charity)
        const r = state.requests.get(id)
        if (!r || r.status !== 1 || r.charityId !== charity.uid) throw new ServiceError('invalid-transition', 'taken')
        const t = now()
        const { charityId: _c, charityName, warehouseId: _w, ...rest } = r
        state.requests.set(id, { ...rest, status: 0, open: false, excluded: [...r.excluded, charity.uid], lastRejection: { charityName: charityName ?? '', reason: reason.trim(), at: t }, updatedAt: t })
        emitInv()
      },
      async chooseAgain(hospital, id, choice) {
        const r = actingHospital(hospital, id)
        const c = state.orgs.get(choice.charityId)
        if (r.status !== 0 || c?.role !== 'charity' || c.status !== 'approved' || c.name !== choice.charityName) throw new ServiceError('invalid-transition', 'cannot choose')
        const t = now()
        state.requests.set(id, { ...moveRejection(r), ...choice, status: 1, open: false, sentAt: t, updatedAt: t })
        emitInv()
      },
      async startPreparing(charity, id, canDeliver) {
        actingCharity(charity)
        const r = state.requests.get(id)
        if (!r || r.status !== 2 || r.charityId !== charity.uid) throw new ServiceError('invalid-transition', 'not ready')
        const t = now()
        state.requests.set(id, { ...r, status: 3, mode: canDeliver ? 'delivery' : 'pickup', preparingAt: t, updatedAt: t })
        emitInv()
      },
      async dispatch(charity, id, driver) {
        actingCharity(charity)
        const r = state.requests.get(id)
        if (!r || r.status !== 3 || r.charityId !== charity.uid) throw new ServiceError('invalid-transition', 'not preparing')
        if ((r.mode === 'delivery') !== !!driver || (driver && !validPerson(driver))) throw new ServiceError('invalid-transition', 'driver')
        const t = now()
        state.requests.set(id, { ...r, status: 4, outAt: t, ...(driver ? { driver: { ...driver } } : {}), updatedAt: t })
        emitInv()
      },
      async markArrived(charity, id) {
        actingCharity(charity)
        const r = state.requests.get(id)
        if (!r || r.status !== 4 || r.charityId !== charity.uid) throw new ServiceError('invalid-transition', 'not out')
        const t = now()
        state.requests.set(id, { ...r, status: 5, arrivedAt: t, updatedAt: t })
        emitInv()
      },
      async submitCode(charity, id, code) {
        actingCharity(charity)
        const r = state.requests.get(id)
        if (!r || r.status !== 5 || r.charityId !== charity.uid) throw new ServiceError('invalid-transition', 'not arrived')
        const fails = r.codeFails ?? 0
        if (fails >= 5) return { result: 'locked' as const, remaining: 0 }
        const attempt = toWesternDigits(code).trim()
        const counted = { ...r, codeFails: fails + 1, updatedAt: now() }
        state.requests.set(id, counted)
        if (attempt !== state.codes.get(id)) { emitInv(); return { result: 'wrong' as const, remaining: 5 - counted.codeFails } }
        const t = now()
        for (const [sid, n] of Object.entries(r.reservation ?? {})) {
          const k = `${charity.uid}/${sid}`
          const row = state.stock.get(k)!
          state.stock.set(k, { ...row, qty: row.qty - n, reserved: row.reserved - n, updatedAt: t })
        }
        state.requests.set(id, { ...counted, status: 6, verifiedAt: t, updatedAt: t })
        emitInv()
        return { result: 'ok' as const, remaining: 5 - counted.codeFails }
      },
      async setPickup(hospital, id, courier) {
        const r = actingHospital(hospital, id)
        if (r.mode !== 'pickup' || r.status < 3 || r.status > 4 || !validPerson(courier)) throw new ServiceError('invalid-transition', 'pickup')
        state.requests.set(id, { ...r, pickup: { ...courier }, updatedAt: now() })
        emitInv()
      },
      async unlockCode(hospital, id) {
        const r = actingHospital(hospital, id)
        if (r.status !== 5 || (r.codeFails ?? 0) < 5) throw new ServiceError('invalid-transition', 'not locked')
        state.requests.set(id, { ...r, codeFails: 0, updatedAt: now() })
        emitInv()
      },
      async setMeeting(by, id, meeting) {
        const r = state.requests.get(id)
        const me = state.current?.uid
        const allowed = !!r && me === by.uid && (r.hospitalId === me || r.charityId === me) && r.status >= 2 && r.status <= 5
        if (!allowed || (meeting && !/^https:\/\/.+/.test(meeting.link))) throw new ServiceError('invalid-transition', 'meeting')
        const next: HospitalRequest = { ...r!, updatedAt: now() }
        if (meeting) next.meeting = { at: meeting.at, link: meeting.link.trim(), byRole: by.role, byName: by.name }
        else delete next.meeting
        state.requests.set(id, next)
        emitInv()
      },
      async publishOpen(hospital, id) {
        const r = actingHospital(hospital, id)
        if (r.status !== 0 || r.open) throw new ServiceError('invalid-transition', 'not waiting')
        const t = now()
        state.requests.set(id, { ...moveRejection(r), open: true, publishedAt: t, updatedAt: t })
        emitInv()
      },
      watchRejection(id, cb) {
        return listenReq(() => { const h = state.history.get(id); cb(h && h.hospitalId === state.current?.uid ? h.lastRejection : null) })
      },
      watchCode(id, cb, onError) {
        // Like the rules: the code is readable only after the charity approved (status ≥ 2).
        return listenReq(() => { const r = mineOrNull(id); cb(r && r.status >= 2 ? state.codes.get(id) ?? null : null) }, onError)
      },
      watchContact(id, cb, onError) {
        return listenReq(() => {
          const r = state.requests.get(id)
          const c = state.contacts.get(id)
          const me = state.current?.uid
          const ok = !!r && !!c && (r.hospitalId === me || (r.charityId === me && r.status >= 2))
          cb(ok ? { name: c!.name, phone: c!.phone } : null)
        }, onError)
      },
      async loadCandidates(itemId) {
        if (seed.failures?.requests) throw new ServiceError('network')
        const approvedCharity = (uid: string) => { const o = state.orgs.get(uid); return o?.role === 'charity' && o.status === 'approved' }
        const rows = [...state.stock.values()].filter(r => r.itemId === itemId && r.orgRole === 'charity' && approvedCharity(r.orgId))
        const ids = [...new Set(rows.map(r => r.orgId))]
        const warehouses = ids.flatMap(id => (state.warehouses.get(id) ?? []).filter(w => rows.some(r => r.orgId === id && r.warehouseId === w.id)).map(w => ({ ...w, orgId: id })))
        const charities = ids.map(id => { const o = state.orgs.get(id)!; return { id, name: o.name, canDeliver: !!o.canDeliver, workingHours: o.workingHours ?? '' } })
        return { charities, warehouses, rows }
      },
      async send(hospital, req, choice) {
        const o = state.orgs.get(hospital.uid)
        if (o?.status !== 'approved' || o.role !== 'hospital') throw new ServiceError('invalid-transition', 'only approved hospitals send')
        if (seed.failures?.requests) throw new ServiceError('network')
        if (choice) {
          const c = state.orgs.get(choice.charityId)
          if (c?.role !== 'charity' || c.status !== 'approved' || c.name !== choice.charityName) throw new ServiceError('invalid-transition', 'bad charity')
        }
        const wanted = resolveItem(req.item, normalizeName)
        const item = state.items.get(wanted.key) ?? wanted
        state.items.set(item.key, item)
        const id = `r${++state.nextId}`
        const t = now()
        state.requests.set(id, {
          id, hospitalId: hospital.uid, hospitalName: hospital.name, itemId: item.key, itemName: item.name, qty: req.qty, accept: req.accept,
          priority: req.priority, beneficiaries: req.beneficiaries, neededBy: req.neededBy, delivery: { ...req.delivery },
          status: choice ? 1 : 0, open: !choice, excluded: [], ...(choice ?? {}), ...(choice ? { sentAt: t } : { publishedAt: t }), createdAt: t, updatedAt: t,
        })
        state.contacts.set(id, { hospitalId: hospital.uid, ...req.receiver })
        const code = makeReceiptCode()
        state.codes.set(id, code)
        emitInv()
        return { id, code }
      },
    },
  }
  return Object.assign(services, { _state: state, _emit: emitInv })
}
