import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFirebaseServices } from '../../src/services/firebaseServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { HospitalRequest, ValidRequest } from '../../src/features/requests/types'
import type { Services } from '../../src/services/types'

const PROJECT = 'demo-wesal'
let env: RulesTestEnvironment
const CH = SEED_ITEMS[0]
type Client = { s: Services; me: OrgRef; wh?: Warehouse }

function next<T>(subscribe: (cb: (v: T) => void) => () => void, until: (v: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), 8000)
    const stop = subscribe(v => { if (until(v)) { clearTimeout(timer); stop(); resolve(v) } })
  })
}
async function client(name: string, role: OrgRef['role'], orgName: string, qty?: number): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com` }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const s = createFirebaseServices({ auth, db })
  const u = await s.auth.signUp(`${name}@test.sa`, 'password123')
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().doc(`orgs/${u.uid}`).set({ role, name: orgName, status: 'approved', city: 'جدة', district: 'حي', licenseNo: 'X-1', workingHours: 'الأحد', canDeliver: true, createdAt: new Date(), updatedAt: new Date() })
  })
  const me = { uid: u.uid, name: orgName, role }
  if (qty === undefined) return { s, me }
  const loc = { lat: 21.57, lng: 39.17 }
  const id = await s.inventory.saveWarehouse(me, null, { name: 'المستودع', city: 'جدة', district: 'حي', location: loc })
  const wh = { id, name: 'المستودع', city: 'جدة', district: 'حي', location: loc, createdAt: new Date(), updatedAt: new Date() }
  await s.inventory.setStock(me, wh, { kind: 'existing', item: CH }, 'new', qty)
  return { s, me, wh }
}
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CH }, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40, neededBy: new Date(2026, 11, 1),
  receiver: { name: 'أحمد الغامدي', phone: '0551234567' }, delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: '' },
}

let H: Client, C: Client
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
  await env.clearFirestore()
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
  H = await client('dlv-h', 'hospital', 'مستشفى الملك فهد')
  C = await client('dlv-c', 'charity', 'جمعية البر', 50)
}, 60000)
afterAll(async () => { await env?.cleanup() })

describe('delivery journey on the emulator', () => {
  it('prepare → out → arrived → wrong code counted → right code closes and deducts stock', async () => {
    const { id, code } = await H.s.requests.send(H.me, REQ, { charityId: C.me.uid, charityName: C.me.name, warehouseId: C.wh!.id })
    await next<HospitalRequest | null>(cb => C.s.requests.watchOne(id, cb), r => r?.status === 1)
    await C.s.requests.accept(C.me, id, C.wh!.id)
    await C.s.requests.setMeeting(C.me, id, { at: new Date(2026, 10, 27, 9), link: 'https://meet.google.com/abc-defg-hij' })
    await C.s.requests.startPreparing(C.me, id, true)
    await C.s.requests.dispatch(C.me, id, { name: 'فهد العتيبي', phone: '0551112222', eta: new Date(2026, 10, 27, 14, 30) })
    await C.s.requests.markArrived(C.me, id)
    const seen = await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 5)
    expect(seen).toMatchObject({ mode: 'delivery', driver: { name: 'فهد العتيبي' }, meeting: { byRole: 'charity' } })
    for (const k of ['acceptedAt', 'preparingAt', 'outAt', 'arrivedAt'] as const) expect(seen![k]).toBeInstanceOf(Date)

    const wrong = code === '0000' ? '1111' : '0000'
    expect(await C.s.requests.submitCode(C.me, id, wrong)).toEqual({ result: 'wrong', remaining: 4 })
    expect(await C.s.requests.submitCode(C.me, id, code)).toEqual({ result: 'ok', remaining: 3 })
    expect(await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 6)).toMatchObject({ status: 6 })
    const rows = await next<StockRow[]>(cb => C.s.inventory.watchStock(C.me.uid, cb), l => l[0]?.qty === 10)
    expect(rows[0]).toMatchObject({ qty: 10, reserved: 0 })
  }, 40000)
})
