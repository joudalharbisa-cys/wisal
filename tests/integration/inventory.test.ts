import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFirebaseServices } from '../../src/services/firebaseServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { Item, OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { Services } from '../../src/services/types'

const PROJECT = 'demo-wesal'
let env: RulesTestEnvironment
const WH = { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.62, lng: 39.15 } }

function next<T>(subscribe: (cb: (v: T) => void) => () => void, until: (v: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), 8000)
    const stop = subscribe(v => {
      if (until(v)) { clearTimeout(timer); stop(); resolve(v) }
    })
  })
}

/** One signed-in client per org, each with its own Firebase app. */
async function client(name: string, email: string, role: OrgRef['role'], orgName: string): Promise<{ s: Services; me: OrgRef }> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com` }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const s = createFirebaseServices({ auth, db })
  const u = await s.auth.signUp(email, 'password123')
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().doc(`orgs/${u.uid}`).set({ role, name: orgName, status: 'approved', city: 'جدة', district: 'النعيم', licenseNo: 'X-1', createdAt: new Date(), updatedAt: new Date() })
  })
  return { s, me: { uid: u.uid, name: orgName, role } }
}

let H: { s: Services; me: OrgRef }
let C: { s: Services; me: OrgRef }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.clearFirestore()
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
  H = await client('inv-h', 'h@test.sa', 'hospital', 'مستشفى الملك فهد')
  C = await client('inv-c', 'c@test.sa', 'charity', 'جمعية البر')
}, 30000)
afterAll(async () => { await env?.cleanup() })

async function newWarehouse(x: { s: Services; me: OrgRef }, name = WH.name): Promise<Warehouse> {
  const id = await x.s.inventory.saveWarehouse(x.me, null, { ...WH, name })
  const list = await next<Warehouse[]>(cb => x.s.inventory.watchWarehouses(x.me.uid, cb), l => l.some(w => w.id === id))
  return list.find(w => w.id === id)!
}
const rowsOf = (x: { s: Services; me: OrgRef }, until: (r: StockRow[]) => boolean) => next<StockRow[]>(cb => x.s.inventory.watchStock(x.me.uid, cb), until)

describe('inventory on the emulator', () => {
  it('approved hospital stores a warehouse and a new product', async () => {
    const w = await newWarehouse(H)
    expect(w.location).toEqual(WH.location)
    expect(w.createdAt).toBeInstanceOf(Date)
    await H.s.inventory.setStock(H.me, w, { kind: 'new', name: 'عكازات' }, 'used', 30)
    const rows = await rowsOf(H, r => r.length === 1)
    expect(rows[0]).toMatchObject({ id: `${w.id}__عكازات__used`, orgName: 'مستشفى الملك فهد', itemName: 'عكازات', qty: 30, reserved: 0 })
    const items = await next<Item[]>(cb => H.s.inventory.watchItems(cb), l => l.length > 0)
    expect(items).toContainEqual({ key: 'عكازات', name: 'عكازات' })
  }, 20000)

  it('second org reuses a seed product created by the first', async () => {
    const chairs = SEED_ITEMS[0]
    const wh = (await next<Warehouse[]>(cb => H.s.inventory.watchWarehouses(H.me.uid, cb), l => l.length > 0))[0]
    await H.s.inventory.setStock(H.me, wh, { kind: 'existing', item: chairs }, 'new', 40)
    const wc = await newWarehouse(C, 'مستودع الحمدانية')
    await C.s.inventory.setStock(C.me, wc, { kind: 'existing', item: chairs }, 'new', 12)
    const items = await next<Item[]>(cb => C.s.inventory.watchItems(cb), l => l.some(i => i.key === chairs.key))
    expect(items.filter(i => i.key === chairs.key)).toHaveLength(1)
  }, 20000)

  it('same product and condition twice keeps one row with the new qty', async () => {
    const wc = (await next<Warehouse[]>(cb => C.s.inventory.watchWarehouses(C.me.uid, cb), l => l.length > 0))[0]
    await C.s.inventory.setStock(C.me, wc, { kind: 'existing', item: SEED_ITEMS[0] }, 'new', 25)
    const rows = await rowsOf(C, r => r.length === 1 && r[0].qty === 25)
    expect(rows).toHaveLength(1)
  }, 20000)

  it('rename updates rows; delete removes rows', async () => {
    const w = (await next<Warehouse[]>(cb => H.s.inventory.watchWarehouses(H.me.uid, cb), l => l.length > 0))[0]
    await H.s.inventory.saveWarehouse(H.me, w.id, { ...WH, name: 'مستودع الشرفية' })
    const renamed = await rowsOf(H, r => r.length === 2 && r.every(x => x.warehouseName === 'مستودع الشرفية'))
    expect(renamed).toHaveLength(2)
    await H.s.inventory.deleteWarehouse(H.me.uid, w.id)
    await rowsOf(H, r => r.length === 0)
    await next<Warehouse[]>(cb => H.s.inventory.watchWarehouses(H.me.uid, cb), l => l.length === 0)
  }, 20000)
})
