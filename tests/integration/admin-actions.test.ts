import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFirebaseServices } from '../../src/services/firebaseServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, Warehouse } from '../../src/features/inventory/types'
import type { RequestEvent } from '../../src/features/requests/events'
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

let H: Client, C1: Client, C2: Client, A: Client
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } })
  await env.clearFirestore()
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
  H = await client('aa-h', 'hospital', 'مستشفى الملك فهد')
  C1 = await client('aa-c1', 'charity', 'جمعية البر', 50)
  C2 = await client('aa-c2', 'charity', 'جمعية الشمال', 60)
  A = await client('aa-a', 'hospital', 'مدير')
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().doc(`orgs/${A.me.uid}`).delete()
    await ctx.firestore().doc(`admins/${A.me.uid}`).set({ name: 'مدير' })
  })
}, 60000)
afterAll(async () => { await env?.cleanup() })

describe('admin actions on the emulator', () => {
  it('return to the hospital, note, and reset code attempts — each logged as the admin', async () => {
    const { id, code } = await H.s.requests.send(H.me, REQ, { charityId: C2.me.uid, charityName: C2.me.name, warehouseId: C2.wh!.id })
    await next<HospitalRequest | null>(cb => A.s.requests.watchOne(id, cb), r => r?.status === 1)
    await A.s.admin.returnToHospital(id, 'الجمعية ما ردت')
    const back = await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 0)
    expect(back).toMatchObject({ open: false, excluded: [], adminReturn: { charityName: 'جمعية الشمال', reason: 'الجمعية ما ردت' } })

    await H.s.requests.chooseAgain(H.me, id, { charityId: C1.me.uid, charityName: C1.me.name, warehouseId: C1.wh!.id })
    expect((await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.status === 1))?.adminReturn).toBeUndefined()
    await next<HospitalRequest | null>(cb => C1.s.requests.watchOne(id, cb), r => r?.status === 1)
    await C1.s.requests.accept(C1.me, id, C1.wh!.id)

    await A.s.admin.setNote(id, 'تواصلنا مع الجمعية والتوصيل بكرة')
    expect((await next<HospitalRequest | null>(cb => C1.s.requests.watchOne(id, cb), r => !!r?.adminNote))?.adminNote?.text).toBe('تواصلنا مع الجمعية والتوصيل بكرة')
    expect((await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => !!r?.adminNote))?.adminNote?.at).toBeInstanceOf(Date)

    await C1.s.requests.startPreparing(C1.me, id, true)
    await C1.s.requests.dispatch(C1.me, id, { name: 'فهد العتيبي', phone: '0551112222', eta: new Date(2026, 11, 1, 14) })
    await C1.s.requests.markArrived(C1.me, id)
    expect((await C1.s.requests.submitCode(C1.me, id, code === '0000' ? '1111' : '0000')).result).toBe('wrong')
    await next<HospitalRequest | null>(cb => A.s.requests.watchOne(id, cb), r => r?.codeFails === 1)
    await A.s.admin.resetCode(id)
    expect(await next<HospitalRequest | null>(cb => H.s.requests.watchOne(id, cb), r => r?.codeFails === 0)).toMatchObject({ codeFails: 0 })

    const log = await next<RequestEvent[]>(cb => A.s.requests.watchEvents(id, cb), l => l.length === 10)
    expect(log.filter(e => e.byRole === 'admin').map(e => e.type)).toEqual(['returned', 'note', 'unlocked'])
    expect(log.every(e => e.byRole !== 'admin' || e.byName === 'إدارة وصال')).toBe(true)
  }, 60000)

  it('a hospital or charity cannot use the admin actions', async () => {
    const { id } = await H.s.requests.send(H.me, REQ, { charityId: C1.me.uid, charityName: C1.me.name, warehouseId: C1.wh!.id })
    await expect(H.s.admin.returnToHospital(id, 'تجربة سبب')).rejects.toBeTruthy()
    await expect(C1.s.admin.setNote(id, 'ملاحظة')).rejects.toBeTruthy()
  }, 30000)
})
