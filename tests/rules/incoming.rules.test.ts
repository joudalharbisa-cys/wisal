import { readFileSync } from 'node:fs'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
const ts = () => firebase.firestore.FieldValue.serverTimestamp()
const del = () => firebase.firestore.FieldValue.delete()

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wesal', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
})
afterAll(async () => { await env?.cleanup() })

const user = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@test.sa` }).firestore()
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(path).set(data) })
}
const org = (role: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({ role, name, status, city: 'جدة', district: 'النعيم', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date(), ...extra })
const WH = { name: 'المستودع', city: 'جدة', district: 'النعيم', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() }
const ITEM = 'كراسي متحركه'

const common = {
  hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: ITEM, itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent',
  beneficiaries: 40, neededBy: new Date(2026, 10, 27), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  excluded: [] as string[], createdAt: new Date(), updatedAt: new Date(),
}
const sent = (over: Record<string, unknown> = {}) => ({ ...common, status: 1, open: false, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', ...over })
const openReq = (over: Record<string, unknown> = {}) => ({ ...common, status: 0, open: true, ...over })
const rejected = (over: Record<string, unknown> = {}) => ({ ...common, status: 0, open: false, excluded: ['c1'], lastRejection: { charityName: 'جمعية البر', reason: 'محجوز', at: new Date() }, ...over })

beforeEach(async () => {
  await env.clearFirestore()
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد', 'approved'))
  await seed('orgs/c1', org('charity', 'جمعية البر', 'approved', { workingHours: 'الأحد', canDeliver: true }))
  await seed('orgs/c2', org('charity', 'جمعية الشمال', 'approved', { workingHours: 'الأحد', canDeliver: false }))
  await seed('orgs/pc', org('charity', 'جمعية جديدة', 'pending', { workingHours: 'الأحد', canDeliver: false }))
  for (const [o, w] of [['c1', 'wc'], ['c1', 'wc2'], ['c2', 'w2'], ['pc', 'wp']]) await seed(`orgs/${o}/warehouses/${w}`, WH)
})

const r = (uid: string, id = 'r1') => user(uid).doc(`requests/${id}`)
const accept = (over: Record<string, unknown> = {}) => ({ status: 2, reservation: { [`wc__${ITEM}__new`]: 40 }, acceptedAt: ts(), updatedAt: ts(), ...over })
const take = (uid: string, name: string, wh: string, over: Record<string, unknown> = {}) =>
  ({ status: 2, open: false, charityId: uid, charityName: name, warehouseId: wh, reservation: { [`${wh}__${ITEM}__new`]: 40 }, acceptedAt: ts(), updatedAt: ts(), ...over })
const reject = (over: Record<string, unknown> = {}) => ({
  status: 0, charityId: del(), charityName: del(), warehouseId: del(), excluded: ['c1'],
  lastRejection: { charityName: 'جمعية البر', reason: 'الكمية محجوزة', at: ts() }, updatedAt: ts(), ...over,
})

describe('charity reads', () => {
  it('charity reads a request addressed to it', async () => {
    await seed('requests/r1', sent())
    await assertSucceeds(r('c1').get())
  })
  it("charity cannot read another charity's request", async () => {
    await seed('requests/r1', sent())
    await assertFails(r('c2').get())
  })
  it('charity lists open requests (status 0, open)', async () => {
    await seed('requests/r1', openReq())
    await assertSucceeds(user('c2').collection('requests').where('status', '==', 0).where('open', '==', true).get())
  })
  it('charity cannot list status 0 without the open filter', async () => {
    await seed('requests/r1', openReq())
    await assertFails(user('c2').collection('requests').where('status', '==', 0).get())
  })
  it('rejected (not open) request is not readable by other charities', async () => {
    await seed('requests/r1', rejected())
    await assertFails(r('c2').get())
  })
  it('pending charity cannot read open requests', async () => {
    await seed('requests/r1', openReq())
    await assertFails(r('pc').get())
  })
  it('charity lists its own addressed requests', async () => {
    await seed('requests/r1', sent())
    await assertSucceeds(user('c1').collection('requests').where('charityId', '==', 'c1').get())
  })
})

describe('accept and reject', () => {
  it('addressed charity accepts', async () => {
    await seed('requests/r1', sent())
    await assertSucceeds(r('c1').update(accept()))
  })
  it('other charity cannot accept', async () => {
    await seed('requests/r1', sent())
    await assertFails(r('c2').update(accept()))
  })
  it('accept may switch to another own warehouse, not a foreign one', async () => {
    await seed('requests/r1', sent())
    await assertFails(r('c1').update(accept({ warehouseId: 'w2' })))
    await assertSucceeds(r('c1').update(accept({ warehouseId: 'wc2' })))
  })
  it('accept cannot touch other fields', async () => {
    await seed('requests/r1', sent())
    await assertFails(r('c1').update(accept({ qty: 1 })))
  })
  it('addressed charity rejects with reason; excluded grows', async () => {
    await seed('requests/r1', sent())
    await assertSucceeds(r('c1').update(reject()))
  })
  it('reject must clear charity fields and keep open false', async () => {
    await seed('requests/r1', sent())
    await assertFails(r('c1').update(reject({ charityId: 'c1' })))
    await assertFails(r('c1').update(reject({ open: true })))
    await assertFails(r('c1').update(reject({ excluded: [] })))
    await assertFails(r('c1').update(reject({ lastRejection: { charityName: 'جمعية مزيفة', reason: '', at: ts() } })))
  })
})

describe('open requests', () => {
  it('any approved charity takes an open request', async () => {
    await seed('requests/r1', openReq())
    await assertSucceeds(r('c2').update(take('c2', 'جمعية الشمال', 'w2')))
  })
  it('pending charity cannot take', async () => {
    await seed('requests/r1', openReq())
    await assertFails(r('pc').update(take('pc', 'جمعية جديدة', 'wp')))
  })
  it('charity that rejected can take it once open', async () => {
    await seed('requests/r1', openReq({ excluded: ['c1'] }))
    await assertSucceeds(r('c1').update(take('c1', 'جمعية البر', 'wc')))
  })
  it('cannot take a request that is not open', async () => {
    await seed('requests/r1', rejected())
    await assertFails(r('c2').update(take('c2', 'جمعية الشمال', 'w2')))
  })
  it('cannot take under another name or warehouse', async () => {
    await seed('requests/r1', openReq())
    await assertFails(r('c2').update(take('c2', 'جمعية البر', 'w2')))
    await assertFails(r('c2').update(take('c2', 'جمعية الشمال', 'wc')))
  })
})

describe('hospital after a rejection', () => {
  it('hospital chooses another charity after a rejection', async () => {
    await seed('requests/r1', rejected())
    await assertSucceeds(r('h1').update({ status: 1, charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'w2', lastRejection: del(), updatedAt: ts() }))
  })
  it('hospital cannot choose a pending charity', async () => {
    await seed('requests/r1', rejected())
    await assertFails(r('h1').update({ status: 1, charityId: 'pc', charityName: 'جمعية جديدة', warehouseId: 'wp', lastRejection: del(), updatedAt: ts() }))
  })
  it('hospital publishes a rejected request as open', async () => {
    await seed('requests/r1', rejected())
    await assertSucceeds(r('h1').update({ open: true, lastRejection: del(), updatedAt: ts() }))
  })
  it('charity cannot publish', async () => {
    await seed('requests/r1', rejected())
    await assertFails(r('c1').update({ open: true, lastRejection: del(), updatedAt: ts() }))
  })
})

describe('stock reservation and contact', () => {
  const row = { orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wc', warehouseName: 'المستودع', city: 'جدة', itemId: ITEM, itemName: 'كراسي متحركة', condition: 'new', qty: 50, reserved: 0, updatedAt: new Date() }
  it('owner raises reserved up to qty, not above', async () => {
    await seed(`items/${ITEM}`, { name: 'كراسي متحركة', key: ITEM, createdBy: 'c1', createdAt: new Date() })
    await seed(`orgs/c1/stock/wc__${ITEM}__new`, row)
    const ref = user('c1').doc(`orgs/c1/stock/wc__${ITEM}__new`)
    await assertFails(ref.update({ reserved: 60, updatedAt: ts() }))
    await assertSucceeds(ref.update({ reserved: 40, updatedAt: ts() }))
  })
  it('accepting charity reads the contact after accepting, not before', async () => {
    await seed('requestContacts/r1', { hospitalId: 'h1', name: 'أحمد', phone: '0551234567' })
    await seed('requests/r1', sent())
    await assertFails(user('c1').doc('requestContacts/r1').get())
    await seed('requests/r1', sent({ status: 2 }))
    await assertSucceeds(user('c1').doc('requestContacts/r1').get())
    await assertFails(user('c2').doc('requestContacts/r1').get())
  })
})
