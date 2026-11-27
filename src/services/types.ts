import type { Org, OrgApplication, OrgWithId } from '../features/orgs/types'
import type { Condition, Item, ItemChoice, LatLng, OrgRef, StockRow, Warehouse, WarehouseDraft } from '../features/inventory/types'
import type { RequestEvent } from '../features/requests/events'
import type { Candidates, CharityChoice, Contact, HospitalRequest, Person, Rejection, ValidRequest } from '../features/requests/types'

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
    /** The signed-in account changes its own password (current one required; new one 8+ characters). */
    changePassword(current: string, next: string): Promise<void>
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
    /** Oversight (admin only; anyone else gets []): every organisation, request and stock row, live. */
    watchAllOrgs(cb: (orgs: OrgWithId[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Newest activity first. */
    watchAllRequests(cb: (r: HospitalRequest[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    watchAllStock(cb: (rows: StockRow[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** The latest `max` step-log entries across all requests, newest first. */
    watchRecentEvents(max: number, cb: (e: RequestEvent[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Admin actions, each logged as «إدارة وصال». Zero the code attempts (status 5, at least one attempt). */
    resetCode(id: string): Promise<void>
    /** Send a request waiting for a charity's answer (status 1) back to the hospital, with a reason (3–200). */
    returnToHospital(id: string, reason: string): Promise<void>
    /** A note both sides see (2–300 characters after trimming); null removes it. */
    setNote(id: string, text: string | null): Promise<void>
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
    /** The latest rejection after the hospital moved on (hospital only; null otherwise). */
    watchRejection(id: string, cb: (r: Rejection | null) => void): Unsubscribe
    /** The request's step log, oldest first (the hospital and the admin; others get []). */
    watchEvents(id: string, cb: (e: RequestEvent[]) => void): Unsubscribe
    /** Approved charities' stock rows for one product, with their warehouses and profiles. */
    loadCandidates(itemId: string): Promise<Candidates>
    /** Creates the product if needed, the request (status 1 with a charity, else 0 = open) and its receipt code. */
    send(hospital: OrgRef, req: ValidRequest, choice: CharityChoice | null): Promise<{ id: string; code: string }>
    /** Requests addressed to / accepted by this charity, newest first. */
    watchIncoming(charityId: string, cb: (r: HospitalRequest[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Open requests (status 0, published by the hospital). */
    watchOpen(cb: (r: HospitalRequest[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    /** Accept a request sent to this charity, or take an open one, holding stock in one own warehouse.
     *  Errors: ServiceError('invalid-transition', 'short' | 'taken'). */
    accept(charity: OrgRef, id: string, warehouseId: string): Promise<void>
    /** Send it back to the hospital (status 0, not open). */
    reject(charity: OrgRef, id: string, reason: string): Promise<void>
    /** Both move the rejection off the request into the hospital-only history. */
    /** Both move the rejection off the request into the hospital-only history. */
    chooseAgain(hospital: OrgRef, id: string, choice: CharityChoice): Promise<void>
    publishOpen(hospital: OrgRef, id: string): Promise<void>
    /** 2 → 3; the mode (delivery / pickup) follows the charity's «تقدر توصّل». */
    startPreparing(charity: OrgRef, id: string, canDeliver: boolean): Promise<void>
    /** 3 → 4: out for delivery with its driver, or (pickup) ready with no driver. */
    dispatch(charity: OrgRef, id: string, driver: Person | null): Promise<void>
    markArrived(charity: OrgRef, id: string): Promise<void>
    /** Counted attempt, then verify (+ stock deduction). Throws ServiceError('network') when the outcome is unknown. */
    submitCode(charity: OrgRef, id: string, code: string): Promise<{ result: 'ok' | 'wrong' | 'locked'; remaining: number }>
    setPickup(hospital: OrgRef, id: string, courier: Person): Promise<void>
    unlockCode(hospital: OrgRef, id: string): Promise<void>
    /** Either side; null removes it. */
    setMeeting(by: OrgRef, id: string, meeting: { at: Date; link: string } | null): Promise<void>
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
