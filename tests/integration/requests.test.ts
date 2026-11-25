import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFirebaseServices } from '../../src/services/firebaseServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef } from '../../src/features/inventory/types'
import type { HospitalRequest, ValidRequest } from '../../src/features/requests/types'
import type { Services } from '../../src/services/types'

const PROJECT = 'demo-wesal'
let env: RulesTestEnvironment
const CHAIRS = SEED_ITEMS[0]

function next<T>(subscribe: (cb: (v: T) => void) => () => void, until: (v: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), 8000)
    const stop = subscribe(v => { if (until(v)) { clearTimeout(timer); stop(); resolve(v) } })
  })
}

async function client(name: string, email: string, role: OrgRef['role'], orgName: string, extra: Record<string, unknown> = {}) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com` }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const s = createFirebaseServices({ auth, db })
  const u = await s.auth.signUp(email, 'password123')
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().doc(`orgs/${u.uid}`).set({ role, name: orgName, status: 'approved', city: 'جدة', district: 'النعيم', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date(), ...extra })
  })
  return { s, me: { uid: u.uid, name: orgName, role } as OrgRef }
}

let H: { s: Services; me: OrgRef }
let C: { s: Services; me: OrgRef }
let whId = ''
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CHAIRS }, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40, neededBy: new Date(2026, 11, 1),
  receiver: { name: 'أحمد الغامدي', phone: '0551234567' }, delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' },
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
  await env.clearFirestore()
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
  H = await client('req-h', 'rh@test.sa', 'hospital', 'مستشفى الملك فهد')
  C = await client('req-c', 'rc@test.sa', 'charity', 'جمعية البر', { workingHours: 'الأحد – الخميس', canDeliver: true })
  whId = await C.s.inventory.saveWarehouse(C.me, null, { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.572, lng: 39.17 } })
  const wh = { id: whId, name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.572, lng: 39.17 }, createdAt: new Date(), updatedAt: new Date() }
  await C.s.inventory.setStock(C.me, wh, { kind: 'existing', item: CHAIRS }, 'new', 50)
  // A hospital row for the same product must not show up as a candidate.
  const hw = await H.s.inventory.saveWarehouse(H.me, null, { name: 'مخزن', city: 'جدة', district: 'الشرفية', location: { lat: 21.54, lng: 39.17 } })
  await H.s.inventory.setStock(H.me, { ...wh, id: hw, name: 'مخزن', district: 'الشرفية' }, { kind: 'existing', item: CHAIRS }, 'new', 9)
}, 40000)
afterAll(async () => { await env?.cleanup() })

describe('requests on the emulator', () => {
  let sentId = ''
  it('hospital loads candidates and sends to the charity', async () => {
    const c = await H.s.requests.loadCandidates(CHAIRS.key)
    expect(c.rows.map(r => r.orgId)).toEqual([C.me.uid])
    expect(c.warehouses.map(w => w.id)).toEqual([whId])
    expect(c.charities).toEqual([{ id: C.me.uid, name: 'جمعية البر', canDeliver: true, workingHours: 'الأحد – الخميس' }])
    const { id, code } = await H.s.requests.send(H.me, REQ, { charityId: C.me.uid, charityName: 'جمعية البر', warehouseId: whId })
    sentId = id
    expect(code).toMatch(/^\d{4}$/)
    const r = await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), x => !!x)
    expect(r).toMatchObject({ status: 1, open: false, charityId: C.me.uid, qty: 40 })
    expect(await next<{ name: string; phone: string } | null>(cb => H.s.requests.watchContact(id, cb), x => !!x)).toEqual({ name: 'أحمد الغامدي', phone: '0551234567' })
    expect(r!.neededBy).toBeInstanceOf(Date)
    // The code stays hidden from the hospital until the charity approves (phase 5).
    expect(await next<string | null>(cb => H.s.requests.watchCode(id, cb), x => x === null)).toBeNull() // the server refuses until approval (the local cache may answer first)
  }, 20000)

  it('open request is stored with a code', async () => {
    const { id, code } = await H.s.requests.send(H.me, { ...REQ, qty: 500 }, null)
    const r = await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), x => !!x)
    expect(r?.status).toBe(0)
    expect(code).toMatch(/^\d{4}$/)
    expect(await next<string | null>(cb => H.s.requests.watchCode(id, cb), x => x === null)).toBeNull() // the server refuses until approval (the local cache may answer first)
  }, 20000)

  it('hospital sees own requests newest first', async () => {
    const mine = await next<HospitalRequest[]>(cb => H.s.requests.watchMine(H.me.uid, cb), l => l.length === 2)
    expect(mine[0].qty).toBe(500)
    expect(mine[1].id).toBe(sentId)
  }, 20000)

  it('the addressed charity reads the request but not the contact or code before accepting', async () => {
    expect(await next<HospitalRequest | null>(cb => C.s.requests.watchOne(sentId, cb), x => !!x)).toMatchObject({ status: 1 })
    expect(await next<{ name: string; phone: string } | null>(cb => C.s.requests.watchContact(sentId, cb), x => x === null)).toBeNull()
    expect(await next<string | null>(cb => C.s.requests.watchCode(sentId, cb), () => true)).toBeNull()
  }, 20000)
})
