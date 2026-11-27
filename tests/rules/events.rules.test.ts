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
const org = (role: string, name: string, extra: Record<string, unknown> = {}) => ({ role, name, status: 'approved', city: 'جدة', district: 'حي', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date(), ...extra })
const ITEM = 'كراسي متحركه'
const WH = { name: 'المستودع', city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() }

beforeEach(async () => {
  await env.clearFirestore()
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد'))
  await seed('orgs/c1', org('charity', 'جمعية البر', { workingHours: 'الأحد', canDeliver: true }))
  await seed('orgs/c2', org('charity', 'جمعية الشمال', { workingHours: 'الأحد', canDeliver: false }))
  await seed('orgs/c1/warehouses/wc', WH)
  await seed(`items/${ITEM}`, { name: 'كراسي متحركة', key: ITEM, createdBy: 'c1', createdAt: new Date() })
  await seed(`orgs/c1/stock/wc__${ITEM}__new`, { orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wc', warehouseName: 'المستودع', city: 'جدة', itemId: ITEM, itemName: 'كراسي متحركة', condition: 'new', qty: 50, reserved: 0, updatedAt: new Date() })
  await seed('admins/a1', { name: 'مدير' })
})

const request = (over: Record<string, unknown> = {}) => ({
  hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: ITEM, itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent',
  beneficiaries: 40, neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  status: 1, open: false, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', excluded: [], sentAt: ts(), createdAt: ts(), updatedAt: ts(), ...over,
})
const ev = (type: string, byRole: string, byName: string, extra: Record<string, unknown> = {}) => ({ type, at: ts(), byRole, byName, ...extra })

function sendWith(event: Record<string, unknown> | null, eventId = '1', count: number | null = 1) {
  const db = user('h1')
  const b = db.batch()
  b.set(db.doc('requests/r1'), request(count === null ? {} : { eventCount: count }))
  b.set(db.doc('requestSecrets/r1'), { code: '4827', hospitalId: 'h1' })
  b.set(db.doc('requestContacts/r1'), { hospitalId: 'h1', name: 'أحمد', phone: '0551234567' })
  if (event) b.set(db.doc(`requests/r1/events/${eventId}`), event)
  return b.commit()
}
const stored = (over: Record<string, unknown> = {}) => ({ ...request(), sentAt: new Date(), createdAt: new Date(), updatedAt: new Date(), eventCount: 1, ...over })
function acceptWith(uid: string, event: Record<string, unknown>, count = 2, eventId = String(count)) {
  const db = user(uid)
  const b = db.batch()
  b.update(db.doc(`orgs/c1/stock/wc__${ITEM}__new`), { reserved: 40, updatedAt: ts() })
  b.update(db.doc('requests/r1'), { status: 2, reservation: { [`wc__${ITEM}__new`]: 40 }, acceptedAt: ts(), updatedAt: ts(), eventCount: count })
  b.set(db.doc(`requests/r1/events/${eventId}`), event)
  return b.commit()
}

describe('step log', () => {
  it('the hospital logs the send as event 1 in the same batch', async () => {
    await assertSucceeds(sendWith(ev('sent', 'hospital', 'مستشفى الملك فهد', { charityName: 'جمعية البر' })))
  })
  it('an event whose number is not the request counter is refused', async () => {
    await assertFails(sendWith(ev('sent', 'hospital', 'مستشفى الملك فهد'), '2'))
  })
  it('a request may still be created without a log (older clients)', async () => {
    await assertSucceeds(sendWith(null, '1', null))
  })
  it('the accepting charity logs under its own name', async () => {
    await seed('requests/r1', stored())
    await assertSucceeds(acceptWith('c1', ev('accepted', 'charity', 'جمعية البر')))
  })
  it('a log entry under another name, role or type is refused', async () => {
    await seed('requests/r1', stored())
    await assertFails(acceptWith('c1', ev('accepted', 'charity', 'جمعية الشمال')))
    await assertFails(acceptWith('c1', ev('accepted', 'hospital', 'جمعية البر')))
    await assertFails(acceptWith('c1', ev('anything', 'charity', 'جمعية البر')))
    await assertFails(acceptWith('c1', ev('accepted', 'charity', 'جمعية البر', { code: '4827' })))
  })
  it('the counter moves by exactly one', async () => {
    await seed('requests/r1', stored())
    await assertFails(acceptWith('c1', ev('accepted', 'charity', 'جمعية البر'), 3))
  })
  it('log entries are never edited or deleted', async () => {
    await seed('requests/r1', stored())
    await seed('requests/r1/events/1', { type: 'sent', at: new Date(), byRole: 'hospital', byName: 'مستشفى الملك فهد' })
    await assertFails(user('h1').doc('requests/r1/events/1').update({ detail: 'x' }))
    await assertFails(user('h1').doc('requests/r1/events/1').delete())
  })
  it('the hospital and the admin read the log; charities do not', async () => {
    await seed('requests/r1', stored())
    await seed('requests/r1/events/1', { type: 'sent', at: new Date(), byRole: 'hospital', byName: 'مستشفى الملك فهد' })
    await assertSucceeds(user('h1').doc('requests/r1/events/1').get())
    await assertSucceeds(user('a1').doc('requests/r1/events/1').get())
    await assertFails(user('c1').doc('requests/r1/events/1').get())
    await assertFails(user('c2').doc('requests/r1/events/1').get())
    await assertSucceeds(user('a1').collectionGroup('events').get())
    await assertFails(user('h1').collectionGroup('events').get())
  })
  it('no entries outside a step: alias numbers, number 0 on old requests, non-parties', async () => {
    await seed('requests/r1', stored({ eventCount: 5, status: 2 }))
    for (const eid of ['05', '005', '+5', '5']) await assertFails(user('c2').doc(`requests/r1/events/${eid}`).set(ev('verified', 'charity', 'جمعية الشمال')))
    await assertFails(user('c1').doc('requests/r1/events/05').set(ev('accepted', 'charity', 'جمعية البر')))
    const old: Record<string, unknown> = stored({ status: 2 })
    delete old.eventCount
    await seed('requests/r2', old)
    await assertFails(user('c2').doc('requests/r2/events/0').set(ev('returned', 'charity', 'جمعية الشمال')))
  })
  it('a do-nothing change cannot carry a log entry', async () => {
    await seed('requests/r1', stored({ status: 2, eventCount: 2 }))
    const db = user('c1')
    const b = db.batch()
    b.update(db.doc('requests/r1'), { meeting: firebase.firestore.FieldValue.delete(), updatedAt: ts(), eventCount: 3 })
    b.set(db.doc('requests/r1/events/3'), ev('meetingRemoved', 'charity', 'جمعية البر'))
    await assertFails(b.commit())
  })
  it('the entry type must match the step, and admin types are the admin’s only', async () => {
    await seed('requests/r1', stored())
    await assertFails(acceptWith('c1', ev('verified', 'charity', 'جمعية البر')))
    await assertFails(acceptWith('c1', ev('note', 'charity', 'جمعية البر')))
    await assertSucceeds(acceptWith('c1', ev('accepted', 'charity', 'جمعية البر')))
  })
  it('the admin never reads the receipt code', async () => {
    await seed('requests/r1', stored({ status: 4 }))
    await seed('requestSecrets/r1', { code: '4827', hospitalId: 'h1' })
    await assertFails(user('a1').doc('requestSecrets/r1').get())
  })
})
