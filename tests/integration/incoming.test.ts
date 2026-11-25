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
const reservedOf = (c: Client) => next<StockRow[]>(cb => c.s.inventory.watchStock(c.me.uid, cb), r => r.length > 0).then(r => r[0].reserved)

let H: Client, C1: Client, C2: Client
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
  await env.clearFirestore()
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
  H = await client('inc-h', 'hospital', 'مستشفى الملك فهد')
  C1 = await client('inc-c1', 'charity', 'جمعية البر', 50)
  C2 = await client('inc-c2', 'charity', 'جمعية الشمال', 60)
}, 60000)
afterAll(async () => { await env?.cleanup() })

describe('incoming requests on the emulator', () => {
  it('accept reserves stock and reveals the code and contact', async () => {
    const { id, code } = await H.s.requests.send(H.me, REQ, { charityId: C1.me.uid, charityName: C1.me.name, warehouseId: C1.wh!.id })
    await next<HospitalRequest[]>(cb => C1.s.requests.watchIncoming(C1.me.uid, cb), l => l.some(r => r.id === id))
    await C1.s.requests.accept(C1.me, id, C1.wh!.id)
    expect(await next<number>(cb => C1.s.inventory.watchStock(C1.me.uid, r => cb(r[0]?.reserved ?? -1)), n => n === 40)).toBe(40)
    expect(await next<string | null>(cb => H.s.requests.watchCode(id, cb), x => !!x)).toBe(code)
    expect(await next(cb => C1.s.requests.watchContact(id, cb), x => !!x)).toEqual({ name: 'أحمد الغامدي', phone: '0551234567' })
  }, 30000)

  it('rejected request is not open until the hospital publishes it', async () => {
    const { id } = await H.s.requests.send(H.me, { ...REQ, qty: 10 }, { charityId: C2.me.uid, charityName: C2.me.name, warehouseId: C2.wh!.id })
    await next<HospitalRequest | null>(cb => C2.s.requests.watchOne(id, cb), r => r?.status === 1)
    await C2.s.requests.reject(C2.me, id, 'مشغولين')
    const back = await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 0)
    expect(back).toMatchObject({ open: false, excluded: [C2.me.uid], lastRejection: { charityName: 'جمعية الشمال', reason: 'مشغولين' } })
    expect((await next<HospitalRequest[]>(cb => C1.s.requests.watchOpen(cb), () => true)).some(r => r.id === id)).toBe(false)
    await H.s.requests.publishOpen(H.me, id)
    const listed = await next<HospitalRequest[]>(cb => C1.s.requests.watchOpen(cb), l => l.some(r => r.id === id))
    // Other charities see the open request but not who rejected it or why; the hospital keeps it in its history.
    expect(listed.find(r => r.id === id)?.lastRejection).toBeUndefined()
    expect(await next(cb => H.s.requests.watchRejection(id, cb), x => !!x)).toMatchObject({ charityName: 'جمعية الشمال', reason: 'مشغولين' })
    expect(await next(cb => C1.s.requests.watchRejection(id, cb), () => true)).toBeNull()
    expect((await next<HospitalRequest[]>(cb => C2.s.requests.watchOpen(cb), l => l.some(r => r.id === id))).length).toBeGreaterThan(0)
    // The charity that rejected may take it now that it's open.
    await C2.s.requests.accept(C2.me, id, C2.wh!.id)
    expect(await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 2)).toMatchObject({ charityId: C2.me.uid })
  }, 30000)

  it('two charities race for an open request: one wins', async () => {
    const { id } = await H.s.requests.send(H.me, { ...REQ, qty: 5 }, null)
    await next<HospitalRequest[]>(cb => C1.s.requests.watchOpen(cb), l => l.some(r => r.id === id))
    await next<HospitalRequest[]>(cb => C2.s.requests.watchOpen(cb), l => l.some(r => r.id === id))
    const before = [await reservedOf(C1), await reservedOf(C2)]
    const results = await Promise.allSettled([C1.s.requests.accept(C1.me, id, C1.wh!.id), C2.s.requests.accept(C2.me, id, C2.wh!.id)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const winner = results[0].status === 'fulfilled' ? 0 : 1
    const lost = results[1 - winner] as PromiseRejectedResult
    expect(lost.reason.message).toBe('taken')
    const [W, L] = winner === 0 ? [C1, C2] : [C2, C1]
    // Wait for the server's view: the winner holds 5 more, the loser's stock is untouched.
    expect(await next<number>(cb => W.s.inventory.watchStock(W.me.uid, r => cb(r[0]?.reserved ?? -1)), n => n === before[winner] + 5)).toBe(before[winner] + 5)
    expect(await reservedOf(L)).toBe(before[1 - winner])
    expect(await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 2)).toMatchObject({ charityId: W.me.uid })
  }, 30000)

  it('hospital chooses another charity after a rejection', async () => {
    const { id } = await H.s.requests.send(H.me, { ...REQ, qty: 3 }, { charityId: C1.me.uid, charityName: C1.me.name, warehouseId: C1.wh!.id })
    await next<HospitalRequest | null>(cb => C1.s.requests.watchOne(id, cb), r => r?.status === 1)
    await C1.s.requests.reject(C1.me, id, '')
    await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 0)
    await H.s.requests.chooseAgain(H.me, id, { charityId: C2.me.uid, charityName: C2.me.name, warehouseId: C2.wh!.id })
    expect(await next<HospitalRequest | null>(cb => C2.s.requests.watchOne(id, cb), r => r?.status === 1)).toMatchObject({ charityId: C2.me.uid })
  }, 30000)
})
