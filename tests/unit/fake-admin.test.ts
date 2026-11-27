import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Unsubscribe } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { RequestEvent } from '../../src/features/requests/events'
import type { HospitalRequest, ValidRequest } from '../../src/features/requests/types'
import type { Org, OrgWithId } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const wh = (id: string): Warehouse => ({ id, name: id, city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.15 }, createdAt: new Date(), updatedAt: new Date() })
const row = (orgId: string, w: string, qty: number): StockRow => ({
  id: `${w}__${CH.key}__new`, orgId, orgName: orgId, orgRole: 'charity', warehouseId: w, warehouseName: w, city: 'جدة',
  itemId: CH.key, itemName: CH.name, condition: 'new', qty, reserved: 0, updatedAt: new Date(),
})
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CH }, qty: 10, accept: 'any', priority: 'urgent', beneficiaries: 10, neededBy: new Date(2026, 11, 1),
  receiver: { name: 'أحمد', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
}
function make() {
  return createFakeServices({
    users: ['h1', 'c1', 'a1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn: 'h1', admins: ['a1'],
    orgs: {
      h1: { role: 'hospital', name: H.name, status: 'approved', createdAt: new Date() } as Org,
      c1: { role: 'charity', name: 'جمعية البر', status: 'approved', createdAt: new Date() } as Org,
      c9: { role: 'charity', name: 'جمعية جديدة', status: 'pending', createdAt: new Date() } as Org,
    },
    warehouses: { c1: [wh('wa')] }, stock: [row('c1', 'wa', 50)],
  })
}
const as = async (s: ReturnType<typeof make>, uid: string) => { await s.auth.signOut(); await s.auth.signIn(`${uid}@t.sa`, 'x') }
function watch<T>(sub: (cb: (v: T) => void) => Unsubscribe) {
  let last: T | undefined
  sub(v => { last = v })
  return async () => { await Promise.resolve(); await Promise.resolve(); return last as T }
}

describe('fake admin oversight data', () => {
  it('the admin sees every organisation, request and stock row, and the latest log entries', async () => {
    const s = make()
    await s.requests.send(H, REQ, null)
    await s.requests.send(H, REQ, { charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa' })
    await as(s, 'a1')
    const orgs = await watch<OrgWithId[]>(cb => s.admin.watchAllOrgs(cb))()
    expect(orgs.map(o => o.id).sort()).toEqual(['c1', 'c9', 'h1'])
    expect(await watch<HospitalRequest[]>(cb => s.admin.watchAllRequests(cb))()).toHaveLength(2)
    expect(await watch<StockRow[]>(cb => s.admin.watchAllStock(cb))()).toHaveLength(1)
    const recent = await watch<RequestEvent[]>(cb => s.admin.watchRecentEvents(1, cb))()
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({ type: 'sent', charityName: 'جمعية البر' })
  })

  it('anyone else gets nothing', async () => {
    const s = make()
    await s.requests.send(H, REQ, null)
    expect(await watch<OrgWithId[]>(cb => s.admin.watchAllOrgs(cb))()).toEqual([])
    expect(await watch<HospitalRequest[]>(cb => s.admin.watchAllRequests(cb))()).toEqual([])
    expect(await watch<StockRow[]>(cb => s.admin.watchAllStock(cb))()).toEqual([])
    expect(await watch<RequestEvent[]>(cb => s.admin.watchRecentEvents(5, cb))()).toEqual([])
  })
})
