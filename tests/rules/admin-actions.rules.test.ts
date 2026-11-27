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
const org = (role: string, name: string, extra: Record<string, unknown> = {}) => ({ role, name, status: 'approved', city: 'جدة', district: 'حي', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date(), ...extra })
const ITEM = 'كراسي متحركه'
const request = (over: Record<string, unknown> = {}) => ({
  hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: ITEM, itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent',
  beneficiaries: 40, neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  status: 1, open: false, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', excluded: ['c2'], sentAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(), eventCount: 1, ...over,
})
const ADMIN = { byRole: 'admin', byName: 'إدارة وصال' }

beforeEach(async () => {
  await env.clearFirestore()
  await seed('admins/a1', { name: 'مدير' })
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد'))
  await seed('orgs/c1', org('charity', 'جمعية البر', { workingHours: 'الأحد', canDeliver: true }))
  await seed('orgs/c2', org('charity', 'جمعية الشمال', { workingHours: 'الأحد', canDeliver: false }))
  await seed('orgs/c1/warehouses/wc', { name: 'المستودع', city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() })
  await seed('orgs/c2/warehouses/w2', { name: 'المستودع', city: 'جدة', district: 'حي', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() })
})

/** An update plus its log entry (the next number), as the app writes it. */
function act(uid: string, change: Record<string, unknown>, event: Record<string, unknown>, n = 2) {
  const db = user(uid)
  const b = db.batch()
  b.update(db.doc('requests/r1'), { ...change, updatedAt: ts(), eventCount: n })
  b.set(db.doc(`requests/r1/events/${n}`), { ...event, at: ts() })
  return b.commit()
}

describe('admin: reset code attempts', () => {
  it('the admin zeroes the counter at arrival, locked or not', async () => {
    await seed('requests/r1', request({ status: 5, codeFails: 2 }))
    await assertSucceeds(act('a1', { codeFails: 0 }, { type: 'unlocked', ...ADMIN }))
  })
  it('not before arrival, not with no attempts, not by the hospital before the lock', async () => {
    await seed('requests/r1', request({ status: 4, codeFails: 2 }))
    await assertFails(act('a1', { codeFails: 0 }, { type: 'unlocked', ...ADMIN }))
    await seed('requests/r1', request({ status: 5, codeFails: 0 }))
    await assertFails(act('a1', { codeFails: 0 }, { type: 'unlocked', ...ADMIN }))
    await seed('requests/r1', request({ status: 5, codeFails: 2 }))
    await assertFails(act('h1', { codeFails: 0 }, { type: 'unlocked', byRole: 'hospital', byName: 'مستشفى الملك فهد' }))
  })
  it('the admin logs only as «إدارة وصال»', async () => {
    await seed('requests/r1', request({ status: 5, codeFails: 2 }))
    await assertFails(act('a1', { codeFails: 0 }, { type: 'unlocked', byRole: 'hospital', byName: 'مستشفى الملك فهد' }))
  })
})

describe('admin: return to the hospital', () => {
  const back = (over: Record<string, unknown> = {}) => ({
    status: 0, open: false, charityId: del(), charityName: del(), warehouseId: del(),
    adminReturn: { charityName: 'جمعية البر', reason: 'الجمعية ما ردت', at: ts() }, ...over,
  })
  it('an unanswered request goes back to the hospital; the charity is not marked as rejecting', async () => {
    await seed('requests/r1', request())
    await assertSucceeds(act('a1', back(), { type: 'returned', ...ADMIN, charityName: 'جمعية البر', detail: 'الجمعية ما ردت' }))
  })
  it('needs a reason, the right charity name, status 1, and leaves excluded alone', async () => {
    await seed('requests/r1', request())
    await assertFails(act('a1', back({ adminReturn: { charityName: 'جمعية البر', reason: 'لا', at: ts() } }), { type: 'returned', ...ADMIN }))
    await assertFails(act('a1', back({ adminReturn: { charityName: 'جمعية ثانية', reason: 'الجمعية ما ردت', at: ts() } }), { type: 'returned', ...ADMIN }))
    await assertFails(act('a1', back({ excluded: ['c2', 'c1'] }), { type: 'returned', ...ADMIN }))
    await seed('requests/r1', request({ status: 2 }))
    await assertFails(act('a1', back(), { type: 'returned', ...ADMIN }))
  })
  it('charities and hospitals cannot use it', async () => {
    await seed('requests/r1', request())
    await assertFails(act('h1', back(), { type: 'returned', byRole: 'hospital', byName: 'مستشفى الملك فهد' }))
    await assertFails(act('c1', back(), { type: 'returned', byRole: 'charity', byName: 'جمعية البر' }))
  })
  it('the hospital then chooses again, and the return note goes away', async () => {
    await seed('requests/r1', (({ charityId: _a, charityName: _b, warehouseId: _c, ...r }) => ({ ...r, status: 0, adminReturn: { charityName: 'جمعية البر', reason: 'ما ردت', at: new Date() } }))(request()))
    const choose = { status: 1, charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'w2', sentAt: ts() }
    await assertFails(act('h1', choose, { type: 'resent', byRole: 'hospital', byName: 'مستشفى الملك فهد', charityName: 'جمعية الشمال' }))
    await assertSucceeds(act('h1', { ...choose, adminReturn: del() }, { type: 'resent', byRole: 'hospital', byName: 'مستشفى الملك فهد', charityName: 'جمعية الشمال' }))
  })
})

describe('admin: note on a request', () => {
  it('the admin adds, replaces and removes a note', async () => {
    await seed('requests/r1', request({ status: 3 }))
    await assertSucceeds(act('a1', { adminNote: { text: 'تواصلنا مع الجمعية والتوصيل بكرة', at: ts() } }, { type: 'note', ...ADMIN, detail: 'تواصلنا مع الجمعية والتوصيل بكرة' }))
    await assertSucceeds(act('a1', { adminNote: del() }, { type: 'note', ...ADMIN }, 3))
  })
  it('2–300 characters, no surrounding spaces, nothing else changes', async () => {
    await seed('requests/r1', request({ status: 3 }))
    await assertFails(act('a1', { adminNote: { text: 'ا', at: ts() } }, { type: 'note', ...ADMIN }))
    await assertFails(act('a1', { adminNote: { text: 'ا'.repeat(301), at: ts() } }, { type: 'note', ...ADMIN }))
    await assertFails(act('a1', { adminNote: { text: '   ', at: ts() } }, { type: 'note', ...ADMIN }))
    await assertFails(act('a1', { adminNote: { text: 'ملاحظة', at: ts() }, status: 4 }, { type: 'note', ...ADMIN }))
  })
  it('only the admin writes it', async () => {
    await seed('requests/r1', request({ status: 3 }))
    await assertFails(act('h1', { adminNote: { text: 'ملاحظة', at: ts() } }, { type: 'note', byRole: 'hospital', byName: 'مستشفى الملك فهد' }))
  })
})
