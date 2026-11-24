import type { Org, OrgApplication, OrgWithId } from '../features/orgs/types'

export type AuthUser = { uid: string; email: string }

export type ServiceErrorCode = 'wrong-credentials' | 'email-in-use' | 'weak-password' | 'invalid-email' | 'network' | 'invalid-transition' | 'unknown'

export class ServiceError extends Error {
  code: ServiceErrorCode
  constructor(code: ServiceErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ServiceError'
    this.code = code
  }
}

export type Unsubscribe = () => void

/** Everything the UI needs from the backend. Screens depend on this, never on Firebase directly. */
export interface Services {
  auth: {
    onUserChanged(cb: (u: AuthUser | null) => void): Unsubscribe
    signIn(email: string, password: string): Promise<void>
    signUp(email: string, password: string): Promise<AuthUser>
    signOut(): Promise<void>
  }
  orgs: {
    watchOrg(uid: string, cb: (org: Org | null) => void): Unsubscribe
    submitApplication(user: AuthUser, app: OrgApplication, acceptedByName: string): Promise<void>
    resubmit(uid: string, app: OrgApplication): Promise<void>
  }
  admin: {
    isAdmin(uid: string): Promise<boolean>
    watchPending(cb: (orgs: OrgWithId[]) => void): Unsubscribe
    approve(orgId: string, adminUid: string): Promise<void>
    reject(orgId: string, adminUid: string, reason: string): Promise<void>
  }
}

/** Only the fields that belong to the org's role, without undefined values (Firestore rejects undefined). */
export function applicationFields(app: OrgApplication) {
  const base = { role: app.role, name: app.name.trim(), city: app.city, district: app.district.trim(), licenseNo: app.licenseNo.trim() }
  return app.role === 'hospital'
    ? { ...base, hospitalType: app.hospitalType }
    : { ...base, workingHours: (app.workingHours ?? '').trim(), canDeliver: app.canDeliver }
}
