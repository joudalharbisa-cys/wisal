import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Unsubscribe } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { RequestEvent } from '../../src/features/requests/events'
import type { ValidRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const C1: OrgRef = { uid: 'c1', name: 'جمعية البر', role: 'charity' }
const C2: OrgRef = { uid: 'c2', name: 'جمعية الشمال', role: 'charity' }
const wh = (id: string): Warehouse => ({ id, name: id, city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.15 }, createdAt: new Date(), updatedAt: new Date() })
const row = (org: OrgRef, w: string, qty: number): StockRow => ({
  id: `${w}__${CH.key}__new`, orgId: org.uid, orgName: org.name, orgRole: 'charity', warehouseId: w, warehouseName: w, city: 'جدة',
  itemId: CH.key, itemName: CH.name, condition: 'new', qty, reserved: 0, updatedAt: new Date(),
})
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CH }, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40, neededBy: new Date(2026, 11, 1),
  receiver: { name: 'أحمد', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
}
function make() {
  return createFakeServices({
    users: ['h1', 'c1', 'c2'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn: 'h1',
    orgs: { h1: { role: 'hospital', name: H.name, status: 'approved' } as Org, c1: { role: 'charity', name: C1.name, status: 'approved', canDeliver: true } as Org, c2: { role: 'charity', name: C2.name, status: 'approved' } as Org },
    warehouses: { c1: [wh('wa')], c2: [wh('wb')] }, stock: [row(C1, 'wa', 50), row(C2, 'wb', 60)],
  })
}
const as = async (s: ReturnType<typeof make>, uid: string) => { await s.auth.signOut(); await s.auth.signIn(`${uid}@t.sa`, 'x') }
function watch<T>(sub: (cb: (v: T) => void) => Unsubscribe) {
  let last: T | undefined
  sub(v => { last = v })
  return async () => { await Promise.resolve(); await Promise.resolve(); return last as T }
}

describe('fake step log', () => {
  it('every step is appended in order, under the org that made it', async () => {
    const s = make()
    const { id, code } = await s.requests.send(H, REQ, { charityId: 'c2', charityName: C2.name, warehouseId: 'wb' })
    await as(s, 'c2'); await s.requests.reject(C2, id, 'مشغولين')
    await as(s, 'h1'); await s.requests.chooseAgain(H, id, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
    await as(s, 'c1')
    await s.requests.accept(C1, id, 'wa')
    await s.requests.setMeeting(C1, id, { at: new Date(2026, 11, 1, 9), link: 'https://meet.google.com/abc-defg' })
    await s.requests.startPreparing(C1, id, true)
    await s.requests.dispatch(C1, id, { name: 'فهد العتيبي', phone: '0551112222', eta: new Date(2026, 11, 1, 14) })
    await s.requests.markArrived(C1, id)
    await s.requests.submitCode(C1, id, code === '0000' ? '1111' : '0000')
    await s.requests.submitCode(C1, id, code)

    await as(s, 'h1')
    const log = await watch<RequestEvent[]>(cb => s.requests.watchEvents(id, cb))()
    expect(log.map(e => e.type)).toEqual(['sent', 'rejected', 'resent', 'accepted', 'meetingSet', 'preparing', 'dispatched', 'arrived', 'codeAttempt', 'codeAttempt', 'verified'])
    expect(log.map(e => e.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(log[0]).toMatchObject({ byRole: 'hospital', byName: H.name, charityName: C2.name })
    expect(log[1]).toMatchObject({ byRole: 'charity', byName: C2.name, detail: 'مشغولين' })
    expect(log[2]).toMatchObject({ charityName: C1.name })
    expect(log[6].detail).toContain('فهد العتيبي')
    expect(log[8]).toMatchObject({ count: 1 })
    expect(JSON.stringify(log)).not.toContain(code)
    expect(s._state.requests.get(id)?.eventCount).toBe(11)
  })

  it('charities cannot read the log', async () => {
    const s = make()
    const { id } = await s.requests.send(H, REQ, null)
    await as(s, 'c1')
    expect(await watch<RequestEvent[]>(cb => s.requests.watchEvents(id, cb))()).toEqual([])
  })
})
