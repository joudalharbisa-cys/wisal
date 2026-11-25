import { readFileSync } from 'node:fs'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
const ts = () => firebase.firestore.FieldValue.serverTimestamp()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wesal',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => { await env?.cleanup() })

const user = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@test.sa` }).firestore()
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(path).set(data) })
}
const org = (role: string, name: string, status: string) => ({ role, name, status, city: 'جدة', district: 'النعيم', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date() })
const ITEM = 'كراسي متحركه'

beforeEach(async () => {
  await env.clearFirestore()
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد', 'approved'))
  await seed('orgs/h2', org('hospital', 'مستشفى الولادة', 'approved'))
  await seed('orgs/ph', org('hospital', 'مستشفى تحت المراجعة', 'pending'))
  await seed('orgs/c1', { ...org('charity', 'جمعية البر', 'approved'), workingHours: 'الأحد', canDeliver: true })
  await seed('orgs/c2', { ...org('charity', 'جمعية الشمال', 'approved'), workingHours: 'الأحد', canDeliver: false })
  await seed('orgs/pc', { ...org('charity', 'جمعية جديدة', 'pending'), workingHours: 'الأحد', canDeliver: false })
  await seed('orgs/c1/warehouses/wc', { name: 'المستودع', city: 'جدة', district: 'النعيم', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() })
  await seed('orgs/pc/warehouses/wp', { name: 'المستودع', city: 'جدة', district: 'النعيم', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() })
  await seed(`items/${ITEM}`, { name: 'كراسي متحركة', key: ITEM, createdBy: 'c1', createdAt: new Date() })
})

const base = (over: Record<string, unknown> = {}) => ({
  hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: ITEM, itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent',
  beneficiaries: 40, neededBy: new Date(2026, 10, 27), receiver: { name: 'أحمد', phone: '0551234567' },
  delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  status: 1, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', excluded: [], createdAt: ts(), updatedAt: ts(), ...over,
})
const openReq = (over: Record<string, unknown> = {}) => {
  const r: Record<string, unknown> = base({ status: 0, ...over })
  delete r.charityId; delete r.charityName; delete r.warehouseId
  return r
}
async function send(uid: string, data: Record<string, unknown>, opts: { code?: string | null; id?: string } = {}) {
  const db = user(uid)
  const id = opts.id ?? 'r1'
  const b = db.batch()
  b.set(db.doc(`requests/${id}`), data)
  if (opts.code !== null) b.set(db.doc(`requestSecrets/${id}`), { code: opts.code ?? '4827', hospitalId: data.hospitalId })
  return b.commit()
}
const stored = (over: Record<string, unknown> = {}) => ({ ...base(), createdAt: new Date(), updatedAt: new Date(), ...over })
async function seedRequest() {
  await seed('requests/r1', stored())
  await seed('requestSecrets/r1', { code: '4827', hospitalId: 'h1' })
}

describe('creating requests', () => {
  it('hospital sends a request with its code in one batch', async () => { await assertSucceeds(send('h1', base())) })
  it('hospital publishes an open request with its code', async () => { await assertSucceeds(send('h1', openReq())) })
  it('request without a code is rejected', async () => { await assertFails(send('h1', base(), { code: null })) })
  it('code without a request is rejected', async () => {
    await assertFails(user('h1').doc('requestSecrets/r9').set({ code: '1234', hospitalId: 'h1' }))
  })
  it('code must be four digits', async () => { await assertFails(send('h1', base(), { code: '12a4' })) })
  it('charity cannot create a request', async () => {
    await assertFails(send('c1', base({ hospitalId: 'c1', hospitalName: 'جمعية البر' })))
  })
  it('pending hospital cannot create', async () => {
    await assertFails(send('ph', base({ hospitalId: 'ph', hospitalName: 'مستشفى تحت المراجعة' })))
  })
  it('spoofed hospitalName rejected', async () => { await assertFails(send('h1', base({ hospitalName: 'مستشفى آخر' }))) })
  it('sending to a pending charity rejected', async () => {
    await assertFails(send('h1', base({ charityId: 'pc', charityName: 'جمعية جديدة', warehouseId: 'wp' })))
  })
  it('charityName must match the charity', async () => { await assertFails(send('h1', base({ charityName: 'جمعية مزيفة' }))) })
  it('warehouse must belong to the charity', async () => { await assertFails(send('h1', base({ warehouseId: 'nope' }))) })
  it('status 1 requires charity fields; status 0 forbids them', async () => {
    await assertFails(send('h1', openReq({ status: 1 })))
    await assertFails(send('h1', base({ status: 0 })))
  })
  it('bad phone, qty 0 or delivery outside Saudi box rejected', async () => {
    await assertFails(send('h1', base({ receiver: { name: 'أحمد', phone: '12345' } })))
    await assertFails(send('h1', base({ qty: 0 })))
    await assertFails(send('h1', base({ delivery: { lat: 40, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' } })))
  })
  it('itemName must match the product', async () => { await assertFails(send('h1', base({ itemName: 'شي ثاني' }))) })
})

describe('reading requests', () => {
  it('owner reads own request but not the code before approval', async () => {
    await seedRequest()
    await assertSucceeds(user('h1').doc('requests/r1').get())
    await assertFails(user('h1').doc('requestSecrets/r1').get())
  })
  it('owner reads the code once the charity approved', async () => {
    await seed('requests/r1', stored({ status: 2 }))
    await seed('requestSecrets/r1', { code: '4827', hospitalId: 'h1' })
    await assertSucceeds(user('h1').doc('requestSecrets/r1').get())
  })
  it('other hospital cannot read request or code', async () => {
    await seedRequest()
    await assertFails(user('h2').doc('requests/r1').get())
    await assertFails(user('h2').doc('requestSecrets/r1').get())
  })
  it('charity cannot read request or code', async () => {
    await seedRequest()
    await assertFails(user('c1').doc('requests/r1').get())
    await assertFails(user('c1').doc('requestSecrets/r1').get())
  })
  it('owner lists own requests filtered by hospitalId; unfiltered list denied', async () => {
    await seedRequest()
    await assertSucceeds(user('h1').collection('requests').where('hospitalId', '==', 'h1').get())
    await assertFails(user('h1').collection('requests').get())
  })
  it('nobody updates or deletes a request', async () => {
    await seedRequest()
    await assertFails(user('h1').doc('requests/r1').update({ qty: 10 }))
    await assertFails(user('h1').doc('requests/r1').delete())
    await assertFails(user('h1').doc('requestSecrets/r1').update({ code: '0000' }))
  })
})

describe('charity profiles for ranking', () => {
  it('hospital reads an approved charity org', async () => { await assertSucceeds(user('h1').doc('orgs/c1').get()) })
  it('hospital cannot read another hospital org or a pending charity org', async () => {
    await assertFails(user('h1').doc('orgs/h2').get())
    await assertFails(user('h1').doc('orgs/pc').get())
  })
  it('charity cannot read another charity org', async () => { await assertFails(user('c1').doc('orgs/c2').get()) })
})
