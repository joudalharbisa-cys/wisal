import { readFileSync } from 'node:fs'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
const ts = () => firebase.firestore.FieldValue.serverTimestamp()
const inc = (n: number) => firebase.firestore.FieldValue.increment(n)

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wesal', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
})
afterAll(async () => { await env?.cleanup() })

const user = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@test.sa` }).firestore()
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(path).set(data) })
}
const org = (role: string, name: string, extra: Record<string, unknown> = {}) => ({ role, name, status: 'approved', city: 'جدة', district: 'حي', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date(), ...extra })
const WH = { name: 'المستودع', city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() }
const ITEM = 'كراسي متحركه'
const NEW = `wc__${ITEM}__new`, USED = `wc__${ITEM}__used`
const row = (condition: string, qty: number, reserved: number) => ({ orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wc', warehouseName: 'المستودع', city: 'جدة', itemId: ITEM, itemName: 'كراسي متحركة', condition, qty, reserved, updatedAt: new Date() })
const req = (over: Record<string, unknown> = {}) => ({
  hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: ITEM, itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' }, excluded: [],
  status: 2, open: false, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', reservation: { [NEW]: 30, [USED]: 10 },
  createdAt: new Date(), updatedAt: new Date(), acceptedAt: new Date(), ...over,
})
const person = (over: Record<string, unknown> = {}) => ({ name: 'فهد العتيبي', phone: '0551112222', eta: new Date(2026, 10, 27, 14, 30), ...over })

beforeEach(async () => {
  await env.clearFirestore()
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد'))
  await seed('orgs/c1', org('charity', 'جمعية البر', { workingHours: 'الأحد', canDeliver: true }))
  await seed('orgs/c2', org('charity', 'جمعية الشمال', { workingHours: 'الأحد', canDeliver: false }))
  await seed('orgs/c1/warehouses/wc', WH)
  await seed(`items/${ITEM}`, { name: 'كراسي متحركة', key: ITEM, createdBy: 'c1', createdAt: new Date() })
  await seed(`orgs/c1/stock/${NEW}`, row('new', 50, 30))
  await seed(`orgs/c1/stock/${USED}`, row('used', 20, 10))
  await seed('requestSecrets/r1', { code: '4827', hospitalId: 'h1' })
})
const r = (uid: string) => user(uid).doc('requests/r1')
const c2req = (over: Record<string, unknown> = {}) => req({ charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'w2', reservation: {}, ...over })

describe('forward steps', () => {
  it('charity starts preparing with the right mode', async () => {
    await seed('requests/r1', req())
    await assertFails(r('c1').update({ status: 3, mode: 'pickup', preparingAt: ts(), updatedAt: ts() }))
    await assertSucceeds(r('c1').update({ status: 3, mode: 'delivery', preparingAt: ts(), updatedAt: ts() }))
  })
  it('a charity that does not deliver prepares for pickup', async () => {
    await seed('requests/r1', c2req())
    await assertSucceeds(r('c2').update({ status: 3, mode: 'pickup', preparingAt: ts(), updatedAt: ts() }))
  })
  it('delivery dispatch needs a valid driver', async () => {
    await seed('requests/r1', req({ status: 3, mode: 'delivery' }))
    await assertFails(r('c1').update({ status: 4, outAt: ts(), updatedAt: ts() }))
    await assertFails(r('c1').update({ status: 4, outAt: ts(), driver: person({ phone: '12345' }), updatedAt: ts() }))
    await assertSucceeds(r('c1').update({ status: 4, outAt: ts(), driver: person(), updatedAt: ts() }))
  })
  it('pickup ready forbids a driver', async () => {
    await seed('requests/r1', c2req({ status: 3, mode: 'pickup' }))
    await assertFails(r('c2').update({ status: 4, outAt: ts(), driver: person(), updatedAt: ts() }))
    await assertSucceeds(r('c2').update({ status: 4, outAt: ts(), updatedAt: ts() }))
  })
  it('charity marks arrival', async () => {
    await seed('requests/r1', req({ status: 4, mode: 'delivery' }))
    await assertSucceeds(r('c1').update({ status: 5, arrivedAt: ts(), updatedAt: ts() }))
  })
  it('steps cannot be skipped or reversed', async () => {
    await seed('requests/r1', req())
    await assertFails(r('c1').update({ status: 4, outAt: ts(), driver: person(), updatedAt: ts() }))
    await seed('requests/r1', req({ status: 3, mode: 'delivery' }))
    await assertFails(r('c1').update({ status: 2, updatedAt: ts() }))
  })
  it('hospital cannot move charity steps; another charity cannot either', async () => {
    await seed('requests/r1', req())
    await assertFails(r('h1').update({ status: 3, mode: 'delivery', preparingAt: ts(), updatedAt: ts() }))
    await assertFails(r('c2').update({ status: 3, mode: 'pickup', preparingAt: ts(), updatedAt: ts() }))
  })
})

describe('pickup courier and meeting', () => {
  it('hospital sets its pickup courier from status 3 (pickup only)', async () => {
    await seed('requests/r1', c2req({ status: 3, mode: 'pickup' }))
    await assertSucceeds(r('h1').update({ pickup: person({ name: 'سعد القحطاني' }), updatedAt: ts() }))
    await assertFails(r('c2').update({ pickup: person(), updatedAt: ts() }))
    await seed('requests/r1', req({ status: 3, mode: 'delivery' }))
    await assertFails(r('h1').update({ pickup: person(), updatedAt: ts() }))
  })
  it('either side sets a meeting in statuses 2–5 with an https link', async () => {
    await seed('requests/r1', req())
    const m = (over: Record<string, unknown> = {}) => ({ at: new Date(2026, 10, 26, 9), link: 'https://meet.google.com/abc-defg-hij', byRole: 'hospital', byName: 'مستشفى الملك فهد', ...over })
    await assertSucceeds(r('h1').update({ meeting: m(), updatedAt: ts() }))
    await assertSucceeds(r('c1').update({ meeting: m({ byRole: 'charity', byName: 'جمعية البر' }), updatedAt: ts() }))
    await assertFails(r('h1').update({ meeting: m({ link: 'http://meet.google.com/abc' }), updatedAt: ts() }))
    await assertFails(r('c1').update({ meeting: m(), updatedAt: ts() }))
    await assertFails(r('c2').update({ meeting: m({ byRole: 'charity', byName: 'جمعية الشمال' }), updatedAt: ts() }))
    await seed('requests/r1', req({ status: 6 }))
    await assertFails(r('h1').update({ meeting: m(), updatedAt: ts() }))
  })
})

describe('receipt code', () => {
  const verify = async (uid: string, over: Record<string, unknown> = {}, stock = true) => {
    const db = user(uid)
    const b = db.batch()
    b.update(db.doc('requests/r1'), { status: 6, verifiedAt: ts(), updatedAt: ts(), ...over })
    if (stock) {
      b.update(db.doc(`orgs/c1/stock/${NEW}`), { qty: inc(-30), reserved: inc(-30), updatedAt: ts() })
      b.update(db.doc(`orgs/c1/stock/${USED}`), { qty: inc(-10), reserved: inc(-10), updatedAt: ts() })
    }
    return b.commit()
  }
  it('an attempt is counted (+1) while fewer than 5', async () => {
    await seed('requests/r1', req({ status: 5, mode: 'delivery' }))
    await assertFails(r('c1').update({ codeAttempt: '1111', codeFails: 2, updatedAt: ts() }))
    await assertSucceeds(r('c1').update({ codeAttempt: '1111', codeFails: 1, updatedAt: ts() }))
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeFails: 5 }))
    await assertFails(r('c1').update({ codeAttempt: '1111', codeFails: 6, updatedAt: ts() }))
  })
  it('verify with the stored correct code and the full deduction succeeds', async () => {
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeAttempt: '4827', codeFails: 1 }))
    await assertSucceeds(verify('c1'))
  })
  it('verify carrying its own guess is denied', async () => {
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeAttempt: '1111', codeFails: 1 }))
    await assertFails(verify('c1', { codeAttempt: '4827' }))
  })
  it('verify with a wrong stored code is denied', async () => {
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeAttempt: '1111', codeFails: 1 }))
    await assertFails(verify('c1'))
  })
  it('verify without the stock deduction is denied', async () => {
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeAttempt: '4827', codeFails: 1 }))
    await assertFails(verify('c1', {}, false))
  })
  it('hospital unlocks after 5 wrong attempts; the charity cannot', async () => {
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeAttempt: '1111', codeFails: 3 }))
    await assertFails(r('h1').update({ codeFails: 0, updatedAt: ts() }))
    await seed('requests/r1', req({ status: 5, mode: 'delivery', codeAttempt: '1111', codeFails: 5 }))
    await assertFails(r('c1').update({ codeFails: 0, updatedAt: ts() }))
    await assertSucceeds(r('h1').update({ codeFails: 0, updatedAt: ts() }))
  })
})
