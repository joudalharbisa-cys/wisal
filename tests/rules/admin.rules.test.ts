import { readFileSync } from 'node:fs'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
const ts = () => firebase.firestore.FieldValue.serverTimestamp()

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wesal', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
})
afterAll(async () => { await env?.cleanup() })

const user = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@test.sa` }).firestore()
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(path).set(data) })
}
const org = (role: string, name: string) => ({ role, name, status: 'approved', city: 'جدة', district: 'حي', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date() })
const ITEM = 'كراسي متحركه'
const ROW = { orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wc', warehouseName: 'المستودع', city: 'جدة', itemId: ITEM, itemName: 'كراسي متحركة', condition: 'new', qty: 50, reserved: 0, updatedAt: new Date() }

beforeEach(async () => {
  await env.clearFirestore()
  await seed('admins/a1', { name: 'مدير' })
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد'))
  await seed('orgs/c1', { ...org('charity', 'جمعية البر'), workingHours: 'الأحد', canDeliver: true })
  await seed('orgs/c2', { ...org('charity', 'جمعية الشمال'), workingHours: 'الأحد', canDeliver: false })
  await seed('orgs/c1/warehouses/wc', { name: 'المستودع', city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() })
  await seed(`orgs/c1/stock/wc__${ITEM}__new`, ROW)
  await seed('requests/r1', {
    hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: ITEM, itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent',
    beneficiaries: 40, neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
    status: 1, open: false, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', excluded: ['c2'], createdAt: new Date(), updatedAt: new Date(),
  })
  await seed('requestContacts/r1', { hospitalId: 'h1', name: 'أحمد', phone: '0551234567' })
  await seed('requestHistory/r1', { hospitalId: 'h1', lastRejection: { charityName: 'جمعية الشمال', reason: 'مشغولين', at: new Date() } })
})

describe('admin oversight reads', () => {
  it('the admin reads the receiver and the rejection history of any request', async () => {
    await assertSucceeds(user('a1').doc('requestContacts/r1').get())
    await assertSucceeds(user('a1').doc('requestHistory/r1').get())
  })
  it('the admin lists every request, organisation and stock row', async () => {
    await assertSucceeds(user('a1').collection('requests').get())
    await assertSucceeds(user('a1').collection('orgs').get())
    await assertSucceeds(user('a1').collectionGroup('stock').get())
    await assertSucceeds(user('a1').collection('orgs/c1/warehouses').get())
  })
  it('reading is all: the admin writes no contacts, history, stock or warehouses', async () => {
    await assertFails(user('a1').doc('requestContacts/r1').update({ name: 'غيره' }))
    await assertFails(user('a1').doc('requestHistory/r1').update({ hospitalId: 'h1' }))
    await assertFails(user('a1').doc(`orgs/c1/stock/wc__${ITEM}__new`).update({ qty: 1, updatedAt: ts() }))
    await assertFails(user('a1').doc('orgs/c1/warehouses/wc').update({ name: 'غيره', updatedAt: ts() }))
  })
  it('charities still read no history, and other charities no contact', async () => {
    await assertFails(user('c2').doc('requestHistory/r1').get())
    await assertFails(user('c1').doc('requestHistory/r1').get())
    await assertFails(user('c2').doc('requestContacts/r1').get())
  })
})
