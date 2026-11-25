import { describe, expect, it } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError, type Unsubscribe } from '../../src/services/types'
import type { Org } from '../../src/features/orgs/types'
import type { OrgRef, Warehouse } from '../../src/features/inventory/types'

const org = (role: 'hospital' | 'charity', name: string, status: Org['status']) => ({ role, name, status, city: 'جدة' }) as Org
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const C: OrgRef = { uid: 'c1', name: 'جمعية البر', role: 'charity' }
const WH = { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.62, lng: 39.15 } }

function make() {
  return createFakeServices({
    orgs: { h1: org('hospital', H.name, 'approved'), c1: org('charity', C.name, 'approved'), p1: org('charity', 'جمعية جديدة', 'pending') },
  })
}

/** Subscribe and read the latest value after pending microtasks. */
function watch<T>(sub: (cb: (v: T) => void) => Unsubscribe) {
  let last: T | undefined
  sub(v => { last = v })
  return async () => { await Promise.resolve(); await Promise.resolve(); return last as T }
}

async function warehouse(s: ReturnType<typeof make>, owner = H): Promise<Warehouse> {
  const id = await s.inventory.saveWarehouse(owner, null, WH)
  const list = await watch<Warehouse[]>(cb => s.inventory.watchWarehouses(owner.uid, cb))()
  return list.find(w => w.id === id)!
}

describe('fake inventory', () => {
  it('approved org saves a warehouse and sees it', async () => {
    const s = make()
    const w = await warehouse(s)
    expect(w).toMatchObject({ name: 'المستودع الرئيسي', city: 'جدة', location: { lat: 21.62, lng: 39.15 } })
  })

  it('pending org cannot save a warehouse', async () => {
    const s = make()
    await expect(s.inventory.saveWarehouse({ uid: 'p1', name: 'جمعية جديدة', role: 'charity' }, null, WH)).rejects.toBeInstanceOf(ServiceError)
  })

  it('setStock with a new name creates the product for everyone', async () => {
    const s = make()
    const w = await warehouse(s)
    await s.inventory.setStock(H, w, { kind: 'new', name: ' عكازات ' }, 'used', 30)
    const items = await watch<{ key: string; name: string }[]>(cb => s.inventory.watchItems(cb))()
    expect(items).toContainEqual({ key: 'عكازات', name: 'عكازات' })
    const rows = await watch<any[]>(cb => s.inventory.watchStock('h1', cb))()
    expect(rows[0]).toMatchObject({ id: `${w.id}__عكازات__used`, orgName: H.name, itemName: 'عكازات', qty: 30, reserved: 0 })
  })

  it('same product and condition twice replaces the quantity', async () => {
    const s = make()
    const w = await warehouse(s)
    const choice = { kind: 'existing' as const, item: { key: 'كراسي متحركه', name: 'كراسي متحركة' } }
    await s.inventory.setStock(H, w, choice, 'new', 40)
    await s.inventory.setStock(H, w, choice, 'new', 25)
    const rows = await watch<any[]>(cb => s.inventory.watchStock('h1', cb))()
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(25)
  })

  it('rejects a quantity out of range', async () => {
    const s = make()
    const w = await warehouse(s)
    await expect(s.inventory.setStock(H, w, { kind: 'new', name: 'عكازات' }, 'new', 100000)).rejects.toBeInstanceOf(ServiceError)
  })

  it("renaming a warehouse updates its rows' warehouseName", async () => {
    const s = make()
    const w = await warehouse(s)
    await s.inventory.setStock(H, w, { kind: 'new', name: 'عكازات' }, 'new', 3)
    await s.inventory.saveWarehouse(H, w.id, { ...WH, name: 'مستودع الشرفية' })
    const rows = await watch<any[]>(cb => s.inventory.watchStock('h1', cb))()
    expect(rows[0].warehouseName).toBe('مستودع الشرفية')
  })

  it('deleting a warehouse removes its rows', async () => {
    const s = make()
    const w = await warehouse(s)
    await s.inventory.setStock(H, w, { kind: 'new', name: 'عكازات' }, 'new', 3)
    await s.inventory.deleteWarehouse('h1', w.id)
    expect(await watch<any[]>(cb => s.inventory.watchStock('h1', cb))()).toEqual([])
    expect(await watch<any[]>(cb => s.inventory.watchWarehouses('h1', cb))()).toEqual([])
  })

  it('watchAllStock lists rows of every org', async () => {
    const s = make()
    const wh = await warehouse(s, H)
    const wc = await warehouse(s, C)
    await s.inventory.setStock(H, wh, { kind: 'new', name: 'عكازات' }, 'new', 3)
    await s.inventory.setStock(C, wc, { kind: 'new', name: 'عكازات' }, 'used', 7)
    const all = await watch<any[]>(cb => s.inventory.watchAllStock(cb))()
    expect(all.map(r => r.orgId).sort()).toEqual(['c1', 'h1'])
  })
})
