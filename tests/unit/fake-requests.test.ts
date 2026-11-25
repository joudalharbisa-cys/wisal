import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError, type Unsubscribe } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { HospitalRequest, ValidRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CHAIRS = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const WC: Warehouse = { id: 'wc', name: 'المستودع', city: 'جدة', district: 'النعيم', location: { lat: 21.6, lng: 39.15 }, createdAt: new Date(), updatedAt: new Date() }
const row = (orgId: string, role: 'hospital' | 'charity', itemId = CHAIRS.key): StockRow => ({
  id: `wc__${itemId}__new`, orgId, orgName: orgId, orgRole: role, warehouseId: 'wc', warehouseName: 'المستودع', city: 'جدة',
  itemId, itemName: CHAIRS.name, condition: 'new', qty: 50, reserved: 0, updatedAt: new Date(),
})
const ORGS: Record<string, Org> = {
  h1: { role: 'hospital', name: H.name, status: 'approved' } as Org,
  h2: { role: 'hospital', name: 'مستشفى الولادة', status: 'approved' } as Org,
  c1: { role: 'charity', name: 'جمعية البر', status: 'approved', canDeliver: true, workingHours: 'الأحد' } as Org,
}
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CHAIRS }, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40, neededBy: new Date(2026, 10, 27),
  receiver: { name: 'أحمد', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
}
const users = ['h1', 'h2', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' }))
const make = (signedIn = 'h1') => createFakeServices({
  users, orgs: ORGS, signedIn,
  warehouses: { c1: [WC], h1: [WC] }, stock: [row('c1', 'charity'), row('h1', 'hospital'), row('c1', 'charity', 'اجهزه تنفس')],
})
function watch<T>(sub: (cb: (v: T) => void) => Unsubscribe) {
  let last: T | undefined
  sub(v => { last = v })
  return async () => { await Promise.resolve(); await Promise.resolve(); return last as T }
}

describe('fake requests', () => {
  it('hospital sends to a charity and sees it with its code', async () => {
    const s = make()
    const { id, code } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc' })
    expect(code).toMatch(/^\d{4}$/)
    const r = await watch<HospitalRequest | null>(cb => s.requests.watchOne(id, cb))()
    expect(r).toMatchObject({ status: 1, charityId: 'c1', itemName: 'كراسي متحركة', qty: 40, hospitalName: H.name })
    expect(await watch<string | null>(cb => s.requests.watchCode(id, cb))()).toBe(code)
  })

  it('open request has status 0 and a code', async () => {
    const s = make()
    const { id, code } = await s.requests.send(H, REQ, null)
    const r = await watch<HospitalRequest | null>(cb => s.requests.watchOne(id, cb))()
    expect(r?.status).toBe(0)
    expect(r?.charityId).toBeUndefined()
    expect(code).toMatch(/^\d{4}$/)
  })

  it('charity cannot send', async () => {
    const s = make('c1')
    await expect(s.requests.send({ uid: 'c1', name: 'جمعية البر', role: 'charity' }, REQ, null)).rejects.toBeInstanceOf(ServiceError)
  })

  it('another hospital sees null for the request and code', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, null)
    await s.auth.signOut()
    await s.auth.signIn('h2@t.sa', 'x')
    expect(await watch<HospitalRequest | null>(cb => s.requests.watchOne(id, cb))()).toBeNull()
    expect(await watch<string | null>(cb => s.requests.watchCode(id, cb))()).toBeNull()
  })

  it('loadCandidates returns only charity rows for the item, with warehouses and charity info', async () => {
    const c = await make().requests.loadCandidates(CHAIRS.key)
    expect(c.rows.map(r => r.orgId)).toEqual(['c1'])
    expect(c.warehouses).toEqual([{ ...WC, orgId: 'c1' }])
    expect(c.charities).toEqual([{ id: 'c1', name: 'جمعية البر', canDeliver: true, workingHours: 'الأحد' }])
  })

  it('watchMine is newest first', async () => {
    const s = make()
    const a = await s.requests.send(H, REQ, null)
    const b = await s.requests.send(H, { ...REQ, qty: 5 }, null)
    const mine = await watch<HospitalRequest[]>(cb => s.requests.watchMine('h1', cb))()
    expect(mine.map(r => r.id)).toEqual([b.id, a.id])
  })
})
