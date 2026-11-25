import type { Org, OrgApplication, OrgWithId } from '../features/orgs/types'
import type { Condition, Item, ItemChoice, LatLng, OrgRef, StockRow, Warehouse, WarehouseDraft } from '../features/inventory/types'
import type { Candidates, CharityChoice, Contact, HospitalRequest, ValidRequest } from '../features/requests/types'

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
    /** cb(null) only when the org is confirmed missing; failures go to onError. */
    watchOrg(uid: string, cb: (org: Org | null) => void, onError?: (e: ServiceError) => void): Unsubscribe
    submitApplication(user: AuthUser, app: OrgApplication, acceptedByName: string): Promise<void>
    resubmit(uid: string, app: OrgApplication): Promise<void>
  }
  admin: {
    isAdmin(uid: string): Promise<boolean>
    watchPending(cb: (orgs: OrgWithId[]) => void): Unsubscribe
    approve(orgId: string, adminUid: string): Promise<void>
    reject(orgId: string, adminUid: string, reason: string): Promise<void>
  }
  inventory: {
    /** Products stored in the database (the UI merges SEED_ITEMS). */
    watchItems(cb: (items: Item[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Oldest first. */
    watchWarehouses(uid: string, cb: (w: Warehouse[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    watchStock(uid: string, cb: (rows: StockRow[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Create (id null) or update; an update also refreshes the warehouse name/city copied onto its rows. Returns the id. */
    saveWarehouse(owner: OrgRef, id: string | null, draft: WarehouseDraft & { location: LatLng }): Promise<string>
    /** Removes the warehouse and its rows together. */
    deleteWarehouse(uid: string, id: string): Promise<void>
    /** Creates the product if needed; an existing row for the same product + condition gets the new qty. */
    setStock(owner: OrgRef, warehouse: Warehouse, choice: ItemChoice, condition: Condition, qty: number): Promise<void>
    deleteStock(uid: string, stockId: string): Promise<void>
  }
  requests: {
    /** The hospital's own requests, newest first. */
    watchMine(uid: string, cb: (r: HospitalRequest[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** null when missing or not the caller's. */
    watchOne(id: string, cb: (r: HospitalRequest | null) => void, onError?: (e: ServiceError) => void): Unsubscribe
    watchCode(id: string, cb: (code: string | null) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Receiver name/phone; null when not readable (other orgs, or a charity before accepting). */
    watchContact(id: string, cb: (c: Contact | null) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Approved charities' stock rows for one product, with their warehouses and profiles. */
    loadCandidates(itemId: string): Promise<Candidates>
    /** Creates the product if needed, the request (status 1 with a charity, else 0 = open) and its receipt code. */
    send(hospital: OrgRef, req: ValidRequest, choice: CharityChoice | null): Promise<{ id: string; code: string }>
  }
}

/** The product a choice refers to: existing as-is, or a new one keyed by its normalised name. */
export function resolveItem(choice: ItemChoice, normalize: (s: string) => string): Item {
  return choice.kind === 'existing' ? choice.item : { key: normalize(choice.name), name: choice.name.trim() }
}

/** Only the fields that belong to the org's role, without undefined values (Firestore rejects undefined). */
export function applicationFields(app: OrgApplication) {
  const base = { role: app.role, name: app.name.trim(), city: app.city, district: app.district.trim(), licenseNo: app.licenseNo.trim() }
  return app.role === 'hospital'
    ? { ...base, hospitalType: app.hospitalType }
    : { ...base, workingHours: (app.workingHours ?? '').trim(), canDeliver: app.canDeliver }
}
