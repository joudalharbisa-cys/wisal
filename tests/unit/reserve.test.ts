import { describe, expect, it } from 'vitest'
import { bestWarehouse, planReservation } from '../../src/features/requests/reserve'
import type { StockRow, Warehouse } from '../../src/features/inventory/types'

const K = 'كراسي متحركه'
const row = (wh: string, condition: 'new' | 'used', qty: number, reserved = 0): StockRow => ({
  id: `${wh}__${K}__${condition}`, orgId: 'c1', orgName: 'جمعية', orgRole: 'charity', warehouseId: wh, warehouseName: wh, city: 'جدة',
  itemId: K, itemName: 'كراسي متحركة', condition, qty, reserved, updatedAt: new Date(),
})
const wh = (id: string, lat: number, lng: number): Warehouse => ({ id, name: id, city: 'جدة', district: 'حي', location: { lat, lng }, createdAt: new Date(), updatedAt: new Date() })

describe('reservation plan', () => {
  it('takes new first, then used', () => {
    expect(planReservation({ itemId: K, qty: 40, accept: 'any' }, 'a', [row('a', 'used', 20), row('a', 'new', 30)])).toEqual({ [`a__${K}__new`]: 30, [`a__${K}__used`]: 10 })
  })
  it('uses only new stock when the hospital accepts new only', () => {
    expect(planReservation({ itemId: K, qty: 40, accept: 'new' }, 'a', [row('a', 'used', 20), row('a', 'new', 30)])).toBeNull()
    expect(planReservation({ itemId: K, qty: 30, accept: 'new' }, 'a', [row('a', 'used', 20), row('a', 'new', 30)])).toEqual({ [`a__${K}__new`]: 30 })
  })
  it('reserved stock is not available and other warehouses do not count', () => {
    expect(planReservation({ itemId: K, qty: 40, accept: 'any' }, 'a', [row('a', 'new', 50, 20), row('b', 'new', 50)])).toBeNull()
  })
})

describe('best warehouse', () => {
  it('is the nearest one that covers the whole quantity', () => {
    const r = bestWarehouse({ itemId: K, qty: 40, accept: 'any', delivery: { lat: 21.54, lng: 39.17 } },
      [wh('far', 22.5, 39.9), wh('near-small', 21.55, 39.17), wh('near', 21.57, 39.17)],
      [row('far', 'new', 60), row('near-small', 'new', 10), row('near', 'new', 25), row('near', 'used', 20)])
    expect(r?.warehouse.id).toBe('near')
    expect(r?.available).toBe(45)
  })
  it('is null when no single warehouse covers it', () => {
    expect(bestWarehouse({ itemId: K, qty: 40, accept: 'any', delivery: { lat: 21.54, lng: 39.17 } }, [wh('a', 21.5, 39.1), wh('b', 21.6, 39.2)], [row('a', 'new', 30), row('b', 'new', 30)])).toBeNull()
  })
})
