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

const org = (role: 'hospital' | 'charity', name: string, status: string) => ({ role, name, status, city: 'جدة', district: 'النعيم', licenseNo: 'X-123', createdAt: new Date(), updatedAt: new Date() })
const WH = { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.62, lng: 39.15 } }
const ITEM = 'عكازات'
const SID = `w1__${ITEM}__new`

const newWh = (over: Record<string, unknown> = {}) => ({ ...WH, createdAt: ts(), updatedAt: ts(), ...over })
const newItem = (key = ITEM, over: Record<string, unknown> = {}) => ({ name: key, key, createdBy: 'h1', createdAt: ts(), ...over })
const newRow = (over: Record<string, unknown> = {}) => ({
  orgId: 'h1', orgName: 'مستشفى الملك فهد', orgRole: 'hospital',
  warehouseId: 'w1', warehouseName: WH.name, city: WH.city,
  itemId: ITEM, itemName: ITEM, condition: 'new', qty: 10, reserved: 0, updatedAt: ts(), ...over,
})
const storedRow = (over: Record<string, unknown> = {}) => ({ ...newRow(), updatedAt: new Date(), ...over })

beforeEach(async () => {
  await env.clearFirestore()
  await seed('orgs/h1', org('hospital', 'مستشفى الملك فهد', 'approved'))
  await seed('orgs/c1', org('charity', 'جمعية البر', 'approved'))
  await seed('orgs/p1', org('charity', 'جمعية تحت المراجعة', 'pending'))
  await seed('orgs/c2', org('charity', 'جمعية الشمال', 'approved'))
  await seed('orgs/h2', org('hospital', 'مستشفى الولادة', 'approved'))
  await seed('orgs/ph', org('hospital', 'مستشفى تحت المراجعة', 'pending'))
})

const seedCharityWarehouse = () => seed('orgs/c1/warehouses/wc', { ...WH, createdAt: new Date(), updatedAt: new Date() })
const charityRow = () => storedRow({ orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wc' })
const CSID = `wc__${ITEM}__new`

const seedWarehouse = () => seed('orgs/h1/warehouses/w1', { ...WH, createdAt: new Date(), updatedAt: new Date() })
const seedItem = (key = ITEM) => seed(`items/${key}`, { name: key, key, createdBy: 'h1', createdAt: new Date() })

describe('products', () => {
  it('approved org creates a valid product', async () => {
    await assertSucceeds(user('h1').doc(`items/${ITEM}`).set(newItem()))
  })
  it('pending org cannot create a product', async () => {
    await assertFails(user('p1').doc(`items/${ITEM}`).set(newItem(ITEM, { createdBy: 'p1' })))
  })
  it('key must equal doc id', async () => {
    await assertFails(user('h1').doc(`items/${ITEM}`).set(newItem(ITEM, { key: 'شي ثاني' })))
  })
  it('key with "__" is rejected', async () => {
    await assertFails(user('h1').doc('items/a__b').set(newItem('a__b')))
  })
  it('extra field is rejected', async () => {
    await assertFails(user('h1').doc(`items/${ITEM}`).set(newItem(ITEM, { verified: true })))
  })
  it('nobody can update or delete a product', async () => {
    await seedItem()
    await assertFails(user('h1').doc(`items/${ITEM}`).update({ name: 'عكاز' }))
    await assertFails(user('h1').doc(`items/${ITEM}`).delete())
  })
  it('approved org reads products', async () => {
    await seedItem()
    await assertSucceeds(user('c1').collection('items').get())
  })
  it('pending org cannot read products', async () => {
    await seedItem()
    await assertFails(user('p1').collection('items').get())
  })
})

describe('warehouses', () => {
  it('owner creates a valid warehouse', async () => {
    await assertSucceeds(user('h1').doc('orgs/h1/warehouses/w1').set(newWh()))
  })
  it('cannot create in another org', async () => {
    await assertFails(user('c1').doc('orgs/h1/warehouses/w1').set(newWh()))
  })
  it('pending owner cannot create', async () => {
    await assertFails(user('p1').doc('orgs/p1/warehouses/w1').set(newWh()))
  })
  it('location outside Saudi box is rejected', async () => {
    await assertFails(user('h1').doc('orgs/h1/warehouses/w1').set(newWh({ location: { lat: 40, lng: 39 } })))
    await assertFails(user('h1').doc('orgs/h1/warehouses/w1').set(newWh({ location: { lat: 21.6, lng: 39.1, alt: 3 } })))
  })
  it('unknown city is rejected', async () => {
    await assertFails(user('h1').doc('orgs/h1/warehouses/w1').set(newWh({ city: 'دبي' })))
  })
  it('owner renames warehouse', async () => {
    await seedWarehouse()
    await assertSucceeds(user('h1').doc('orgs/h1/warehouses/w1').update({ name: 'مستودع الشرفية', updatedAt: ts() }))
  })
  it('createdAt cannot change', async () => {
    await seedWarehouse()
    await assertFails(user('h1').doc('orgs/h1/warehouses/w1').update({ createdAt: ts(), updatedAt: ts() }))
  })
  it('owner deletes warehouse', async () => {
    await seedWarehouse()
    await assertSucceeds(user('h1').doc('orgs/h1/warehouses/w1').delete())
  })
  it('owner reads own warehouses', async () => {
    await seedWarehouse()
    await assertSucceeds(user('h1').collection('orgs/h1/warehouses').get())
  })
  it('hospital reads a charity warehouse (for distance)', async () => {
    await seedCharityWarehouse()
    await assertSucceeds(user('h1').doc('orgs/c1/warehouses/wc').get())
  })
  it('charity cannot read a hospital warehouse', async () => {
    await seedWarehouse()
    await assertFails(user('c1').doc('orgs/h1/warehouses/w1').get())
  })
  it('charity cannot read another charity warehouse', async () => {
    await seedCharityWarehouse()
    await assertFails(user('c2').doc('orgs/c1/warehouses/wc').get())
  })
  it('hospital cannot read another hospital warehouse', async () => {
    await seedWarehouse()
    await assertFails(user('h2').doc('orgs/h1/warehouses/w1').get())
  })
  it('pending hospital cannot read charity warehouses', async () => {
    await seedCharityWarehouse()
    await assertFails(user('ph').doc('orgs/c1/warehouses/wc').get())
  })
})

describe('stock', () => {
  const row = (uid = 'h1', id = SID) => user(uid).doc(`orgs/h1/stock/${id}`)

  it('owner creates a valid row', async () => {
    await seedWarehouse(); await seedItem()
    await assertSucceeds(row().set(newRow()))
  })
  it('creates item and row in one batch', async () => {
    await seedWarehouse()
    const db = user('h1')
    const b = db.batch()
    b.set(db.doc(`items/${ITEM}`), newItem())
    b.set(db.doc(`orgs/h1/stock/${SID}`), newRow())
    await assertSucceeds(b.commit())
  })
  it('wrong stock id is rejected', async () => {
    await seedWarehouse(); await seedItem()
    await assertFails(row('h1', `w1__${ITEM}__used`).set(newRow()))
  })
  it('reserved must start at 0', async () => {
    await seedWarehouse(); await seedItem()
    await assertFails(row().set(newRow({ reserved: 2 })))
  })
  it('spoofed orgName is rejected', async () => {
    await seedWarehouse(); await seedItem()
    await assertFails(row().set(newRow({ orgName: 'جمعية البر' })))
  })
  it('itemName must match the item', async () => {
    await seedWarehouse(); await seedItem()
    await assertFails(row().set(newRow({ itemName: 'كراسي' })))
  })
  it('missing warehouse is rejected', async () => {
    await seedItem()
    await assertFails(row().set(newRow()))
  })
  it('owner updates qty', async () => {
    await seedWarehouse(); await seedItem(); await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertSucceeds(row().update({ qty: 25, updatedAt: ts() }))
  })
  it('qty below 0 or above 99999 is rejected', async () => {
    await seedWarehouse(); await seedItem(); await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertFails(row().update({ qty: -1, updatedAt: ts() }))
    await assertFails(row().update({ qty: 100000, updatedAt: ts() }))
    await assertFails(row().update({ qty: 2.5, updatedAt: ts() }))
  })
  it('itemName cannot change on update', async () => {
    await seedWarehouse(); await seedItem(); await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertFails(row().update({ itemName: 'عكاز', updatedAt: ts() }))
  })
  it('reserved can rise up to qty but not above it or below 0', async () => {
    await seedWarehouse(); await seedItem(); await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertFails(row().update({ reserved: 11, updatedAt: ts() }))
    await assertFails(row().update({ reserved: -1, updatedAt: ts() }))
    await assertSucceeds(row().update({ reserved: 3, updatedAt: ts() }))
  })
  it('other org cannot write', async () => {
    await seedWarehouse(); await seedItem(); await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertFails(row('c1').update({ qty: 1, updatedAt: ts() }))
    await assertFails(row('c1').delete())
  })
  it('deletes warehouse and its rows in one batch', async () => {
    await seedWarehouse(); await seedItem(); await seed(`orgs/h1/stock/${SID}`, storedRow())
    const db = user('h1')
    const b = db.batch()
    b.delete(db.doc('orgs/h1/warehouses/w1'))
    b.delete(db.doc(`orgs/h1/stock/${SID}`))
    await assertSucceeds(b.commit())
  })
  it('renames a warehouse holding 25 rows in one batch', async () => {
    await seedWarehouse()
    const keys = Array.from({ length: 25 }, (_, i) => `منتج ${i}`)
    for (const k of keys) {
      await seedItem(k)
      await seed(`orgs/h1/stock/w1__${k}__new`, storedRow({ itemId: k, itemName: k }))
    }
    const db = user('h1')
    const b = db.batch()
    b.update(db.doc('orgs/h1/warehouses/w1'), { name: 'مستودع الشرفية', updatedAt: ts() })
    for (const k of keys) b.update(db.doc(`orgs/h1/stock/w1__${k}__new`), { warehouseName: 'مستودع الشرفية', updatedAt: ts() })
    await assertSucceeds(b.commit())
  })
  it('owner reads own stock', async () => {
    await seed(`orgs/h1/stock/${SID}`, storedRow())
    await seed(`orgs/c1/stock/${CSID}`, charityRow())
    await assertSucceeds(user('h1').collection('orgs/h1/stock').get())
    await assertSucceeds(user('c1').collection('orgs/c1/stock').get())
  })
  it('hospital reads charity stock across orgs, filtered to charities', async () => {
    await seed(`orgs/h1/stock/${SID}`, storedRow())
    await seed(`orgs/c1/stock/${CSID}`, charityRow())
    await assertSucceeds(user('h2').collectionGroup('stock').where('orgRole', '==', 'charity').get())
    await assertSucceeds(user('h2').doc(`orgs/c1/stock/${CSID}`).get())
  })
  it('hospital cannot read other hospitals stock', async () => {
    await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertFails(user('h2').collectionGroup('stock').get())
    await assertFails(user('h2').doc(`orgs/h1/stock/${SID}`).get())
  })
  it('charity cannot read hospital stock', async () => {
    await seed(`orgs/h1/stock/${SID}`, storedRow())
    await assertFails(user('c1').doc(`orgs/h1/stock/${SID}`).get())
  })
  it('charity cannot read other charities stock', async () => {
    await seed(`orgs/c1/stock/${CSID}`, charityRow())
    await assertFails(user('c2').collectionGroup('stock').where('orgRole', '==', 'charity').get())
    await assertFails(user('c2').doc(`orgs/c1/stock/${CSID}`).get())
  })
  it('pending hospital cannot read charity stock', async () => {
    await seed(`orgs/c1/stock/${CSID}`, charityRow())
    await assertFails(user('ph').collectionGroup('stock').where('orgRole', '==', 'charity').get())
  })
})
