import { CONTRACT } from '../features/orgs/contract'
import type { Org, OrgWithId } from '../features/orgs/types'
import { applicationFields, ServiceError, type AuthUser, type Services } from './types'

type Seed = {
  users?: { uid: string; email: string; password: string }[]
  orgs?: Record<string, Org>
  admins?: string[]
  signedIn?: string
  /** Simulate backend failures in tests. */
  failures?: { isAdmin?: boolean; watchOrg?: boolean }
}

/** In-memory backend with the same transitions the security rules allow. Used by UI tests and local demos. */
export function createFakeServices(seed: Seed = {}) {
  const state = {
    users: [...(seed.users ?? [])],
    orgs: new Map<string, Org>(Object.entries(seed.orgs ?? {})),
    admins: new Set(seed.admins ?? []),
    current: null as AuthUser | null,
    clock: 0,
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
  }
  return Object.assign(services, { _state: state })
}
