import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef } from '../../src/features/inventory/types'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const req = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: H.name, itemId: CH.key, itemName: CH.name, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  status: 1, open: false, excluded: ['c2'], charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', createdAt: new Date(), updatedAt: new Date(), ...over,
})
function make(over: Partial<HospitalRequest> = {}, signedIn = 'a1') {
  return createFakeServices({
    users: ['h1', 'c1', 'c2', 'a1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn, admins: ['a1'],
    orgs: { h1: { role: 'hospital', name: H.name, status: 'approved' } as Org, c1: { role: 'charity', name: 'جمعية البر', status: 'approved' } as Org, c2: { role: 'charity', name: 'جمعية الشمال', status: 'approved' } as Org },
    requests: [req(over)],
  })
}
const as = async (s: ReturnType<typeof make>, uid: string) => { await s.auth.signOut(); await s.auth.signIn(`${uid}@t.sa`, 'x') }
const types = (s: ReturnType<typeof make>) => (s._state.events.get('r1') ?? []).map(e => `${e.type}:${e.byRole}`)

describe('fake admin actions', () => {
  it('resets code attempts at arrival, logged as the admin', async () => {
    const s = make({ status: 5, codeFails: 2 })
    await s.admin.resetCode('r1')
    expect(s._state.requests.get('r1')?.codeFails).toBe(0)
    expect(types(s)).toEqual(['unlocked:admin'])
    await expect(s.admin.resetCode('r1')).rejects.toBeInstanceOf(ServiceError) // nothing to reset
  })

  it('returns an unanswered request to the hospital without marking the charity', async () => {
    const s = make()
    await expect(s.admin.returnToHospital('r1', 'لا')).rejects.toBeInstanceOf(ServiceError)
    await s.admin.returnToHospital('r1', 'الجمعية ما ردت')
    const r = s._state.requests.get('r1')!
    expect(r).toMatchObject({ status: 0, open: false, excluded: ['c2'], adminReturn: { charityName: 'جمعية البر', reason: 'الجمعية ما ردت' } })
    expect(r.charityId).toBeUndefined()
    expect(s._state.events.get('r1')?.[0]).toMatchObject({ type: 'returned', byName: 'إدارة وصال', charityName: 'جمعية البر', detail: 'الجمعية ما ردت' })
    await as(s, 'h1')
    await s.requests.chooseAgain(H, 'r1', { charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'wb' })
    expect(s._state.requests.get('r1')?.adminReturn).toBeUndefined()
  })

  it('adds, replaces and removes a note', async () => {
    const s = make({ status: 3 })
    await expect(s.admin.setNote('r1', ' ا ')).rejects.toBeInstanceOf(ServiceError)
    await s.admin.setNote('r1', '  تواصلنا مع الجمعية  ')
    expect(s._state.requests.get('r1')?.adminNote).toMatchObject({ text: 'تواصلنا مع الجمعية' })
    await s.admin.setNote('r1', null)
    expect(s._state.requests.get('r1')?.adminNote).toBeUndefined()
    expect(types(s)).toEqual(['note:admin', 'note:admin'])
  })

  it('only the admin', async () => {
    const s = make({ status: 5, codeFails: 2 }, 'h1')
    await expect(s.admin.resetCode('r1')).rejects.toBeInstanceOf(ServiceError)
    await expect(s.admin.setNote('r1', 'ملاحظة')).rejects.toBeInstanceOf(ServiceError)
  })
})
