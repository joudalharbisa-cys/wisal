import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow } from '../../src/features/inventory/types'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const C1: OrgRef = { uid: 'c1', name: 'جمعية البر', role: 'charity' }
const NEW = `wc__${CH.key}__new`, USED = `wc__${CH.key}__used`
const row = (id: string, condition: 'new' | 'used', qty: number, reserved: number): StockRow => ({
  id, orgId: 'c1', orgName: C1.name, orgRole: 'charity', warehouseId: 'wc', warehouseName: 'المستودع', city: 'جدة', itemId: CH.key, itemName: CH.name, condition, qty, reserved, updatedAt: new Date(),
})
const accepted = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: H.name, itemId: CH.key, itemName: CH.name, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  status: 2, open: false, excluded: [], charityId: 'c1', charityName: C1.name, warehouseId: 'wc', reservation: { [NEW]: 30, [USED]: 10 },
  createdAt: new Date(), updatedAt: new Date(), acceptedAt: new Date(), ...over,
})
function make(over: Partial<HospitalRequest> = {}) {
  return createFakeServices({
    users: ['h1', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn: 'c1',
    orgs: { h1: { role: 'hospital', name: H.name, status: 'approved' } as Org, c1: { role: 'charity', name: C1.name, status: 'approved', canDeliver: true } as Org },
    warehouses: { c1: [{ id: 'wc', name: 'المستودع', city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() }] },
    stock: [row(NEW, 'new', 50, 30), row(USED, 'used', 20, 10)], requests: [accepted(over)], codes: { r1: '4827' },
  })
}
const as = async (s: ReturnType<typeof make>, uid: string) => { await s.auth.signOut(); await s.auth.signIn(`${uid}@t.sa`, 'x') }
const DRIVER = { name: 'فهد العتيبي', phone: '0551112222', eta: new Date(2026, 10, 27, 14, 30) }

describe('fake delivery journey', () => {
  it('delivery: prepare → out with driver → arrived → wrong code → right code deducts stock', async () => {
    const s = make()
    await s.requests.startPreparing(C1, 'r1', true)
    expect(s._state.requests.get('r1')).toMatchObject({ status: 3, mode: 'delivery' })
    await expect(s.requests.dispatch(C1, 'r1', null)).rejects.toBeInstanceOf(ServiceError)
    await s.requests.dispatch(C1, 'r1', DRIVER)
    await s.requests.markArrived(C1, 'r1')
    expect(await s.requests.submitCode(C1, 'r1', '1111')).toEqual({ result: 'wrong', remaining: 4 })
    expect(await s.requests.submitCode(C1, 'r1', '٤٨٢٧')).toEqual({ result: 'ok', remaining: 3 })
    const r = s._state.requests.get('r1')!
    expect(r.status).toBe(6)
    for (const k of ['preparingAt', 'outAt', 'arrivedAt', 'verifiedAt'] as const) expect(r[k]).toBeInstanceOf(Date)
    expect(s._state.stock.get(`c1/${NEW}`)).toMatchObject({ qty: 20, reserved: 0 })
    expect(s._state.stock.get(`c1/${USED}`)).toMatchObject({ qty: 10, reserved: 0 })
  })

  it('pickup: ready without a driver, the hospital adds its courier', async () => {
    const s = make()
    await s.requests.startPreparing(C1, 'r1', false)
    expect(s._state.requests.get('r1')?.mode).toBe('pickup')
    await expect(s.requests.dispatch(C1, 'r1', DRIVER)).rejects.toBeInstanceOf(ServiceError)
    await as(s, 'h1')
    await s.requests.setPickup(H, 'r1', { ...DRIVER, name: 'سعد' })
    await as(s, 'c1')
    await s.requests.dispatch(C1, 'r1', null)
    expect(s._state.requests.get('r1')).toMatchObject({ status: 4, pickup: { name: 'سعد' } })
  })

  it('five wrong codes lock entry until the hospital unlocks', async () => {
    const s = make({ status: 5, mode: 'delivery' })
    for (let i = 0; i < 4; i++) await s.requests.submitCode(C1, 'r1', '0000')
    expect(await s.requests.submitCode(C1, 'r1', '0000')).toEqual({ result: 'wrong', remaining: 0 })
    expect(await s.requests.submitCode(C1, 'r1', '4827')).toEqual({ result: 'locked', remaining: 0 })
    await expect(s.requests.unlockCode(H, 'r1')).rejects.toBeInstanceOf(ServiceError) // not signed in as the hospital
    await as(s, 'h1'); await s.requests.unlockCode(H, 'r1')
    await as(s, 'c1')
    expect((await s.requests.submitCode(C1, 'r1', '4827')).result).toBe('ok')
  })

  it('either side sets and removes a meeting', async () => {
    const s = make()
    await s.requests.setMeeting(C1, 'r1', { at: new Date(2026, 10, 26, 9), link: 'https://meet.google.com/abc' })
    expect(s._state.requests.get('r1')?.meeting).toMatchObject({ byRole: 'charity', byName: C1.name })
    await expect(s.requests.setMeeting(C1, 'r1', { at: new Date(), link: 'http://x.y/z' })).rejects.toBeInstanceOf(ServiceError)
    await as(s, 'h1'); await s.requests.setMeeting(H, 'r1', null)
    expect(s._state.requests.get('r1')?.meeting).toBeUndefined()
  })
})
