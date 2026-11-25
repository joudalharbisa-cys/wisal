import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError, type Unsubscribe } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { HospitalRequest, ValidRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const C1: OrgRef = { uid: 'c1', name: 'جمعية البر', role: 'charity' }
const C2: OrgRef = { uid: 'c2', name: 'جمعية الشمال', role: 'charity' }
const wh = (id: string): Warehouse => ({ id, name: id, city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.15 }, createdAt: new Date(), updatedAt: new Date() })
const row = (org: OrgRef, w: string, condition: 'new' | 'used', qty: number): StockRow => ({
  id: `${w}__${CH.key}__${condition}`, orgId: org.uid, orgName: org.name, orgRole: 'charity', warehouseId: w, warehouseName: w, city: 'جدة',
  itemId: CH.key, itemName: CH.name, condition, qty, reserved: 0, updatedAt: new Date(),
})
const ORGS: Record<string, Org> = {
  h1: { role: 'hospital', name: H.name, status: 'approved' } as Org,
  c1: { role: 'charity', name: C1.name, status: 'approved' } as Org,
  c2: { role: 'charity', name: C2.name, status: 'approved' } as Org,
}
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CH }, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40, neededBy: new Date(2026, 11, 1),
  receiver: { name: 'أحمد', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
}
function make(c1Stock = [row(C1, 'wa', 'new', 30), row(C1, 'wa', 'used', 20)]) {
  return createFakeServices({
    users: ['h1', 'c1', 'c2'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), orgs: ORGS, signedIn: 'h1',
    warehouses: { c1: [wh('wa')], c2: [wh('wb')] }, stock: [...c1Stock, row(C2, 'wb', 'new', 60)],
  })
}
const as = async (s: ReturnType<typeof make>, uid: string) => { await s.auth.signOut(); await s.auth.signIn(`${uid}@t.sa`, 'x') }
function watch<T>(sub: (cb: (v: T) => void) => Unsubscribe) {
  let last: T | undefined
  sub(v => { last = v })
  return async () => { await Promise.resolve(); await Promise.resolve(); return last as T }
}
const reqOf = (s: ReturnType<typeof make>, id: string) => s._state.requests.get(id)!

describe('fake incoming', () => {
  it('addressed charity accepts and stock is reserved, new first', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c1')
    expect((await watch<HospitalRequest[]>(cb => s.requests.watchIncoming('c1', cb))()).map(r => r.id)).toEqual([id])
    await s.requests.accept(C1, id, 'wa')
    expect(reqOf(s, id)).toMatchObject({ status: 2, reservation: { [`wa__${CH.key}__new`]: 30, [`wa__${CH.key}__used`]: 10 } })
    expect(s._state.stock.get(`c1/wa__${CH.key}__new`)?.reserved).toBe(30)
    expect(s._state.stock.get(`c1/wa__${CH.key}__used`)?.reserved).toBe(10)
    expect(await watch(cb => s.requests.watchContact(id, cb))()).toEqual({ name: 'أحمد', phone: '0551234567' })
  })

  it('accept fails when short', async () => {
    const s = make([row(C1, 'wa', 'new', 10)])
    const { id } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c1')
    await expect(s.requests.accept(C1, id, 'wa')).rejects.toMatchObject({ message: 'short' })
    expect(reqOf(s, id).status).toBe(1)
  })

  it('reject sends it back to the hospital (not open)', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c1')
    await s.requests.reject(C1, id, 'محجوز')
    expect(reqOf(s, id)).toMatchObject({ status: 0, open: false, excluded: ['c1'], lastRejection: { charityName: C1.name, reason: 'محجوز' } })
    expect(reqOf(s, id).charityId).toBeUndefined()
    await as(s, 'c2')
    expect(await watch<HospitalRequest[]>(cb => s.requests.watchOpen(cb))()).toEqual([])
  })

  it('hospital publishes, then any charity sees it open and takes it — even the one that rejected', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c1'); await s.requests.reject(C1, id, '')
    await as(s, 'h1'); await s.requests.publishOpen(H, id)
    expect(reqOf(s, id)).toMatchObject({ status: 0, open: true })
    expect(reqOf(s, id).publishedAt).toBeInstanceOf(Date)
    await as(s, 'c1')
    expect((await watch<HospitalRequest[]>(cb => s.requests.watchOpen(cb))()).map(r => r.id)).toEqual([id])
    await s.requests.accept(C1, id, 'wa')
    expect(reqOf(s, id)).toMatchObject({ status: 2, open: false, charityId: 'c1', warehouseId: 'wa' })
  })

  it('a taken open request cannot be taken again', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, null)
    await as(s, 'c2'); await s.requests.accept(C2, id, 'wb')
    await as(s, 'c1')
    await expect(s.requests.accept(C1, id, 'wa')).rejects.toMatchObject({ message: 'taken' })
  })

  it('hospital chooses again', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c1'); await s.requests.reject(C1, id, '')
    await as(s, 'h1'); await s.requests.chooseAgain(H, id, { charityId: 'c2', charityName: C2.name, warehouseId: 'wb' })
    expect(reqOf(s, id)).toMatchObject({ status: 1, open: false, charityId: 'c2' })
    expect(reqOf(s, id).lastRejection?.charityName).toBe(C1.name) // kept as history
    expect(reqOf(s, id).sentAt).toBeInstanceOf(Date)
  })

  it('only the right party can act', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c2')
    await expect(s.requests.reject(C2, id, '')).rejects.toBeInstanceOf(ServiceError)
    await expect(s.requests.publishOpen(H, id)).rejects.toBeInstanceOf(ServiceError)
  })
})
