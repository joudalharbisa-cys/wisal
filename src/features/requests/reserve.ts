import type { LatLng, StockRow, Warehouse } from '../inventory/types'
import { haversineKm } from './rank'
import type { Accept } from './types'

type Need = { itemId: string; qty: number; accept: Accept }

const usable = (need: Need, warehouseId: string, rows: StockRow[]) =>
  rows
    .filter(r => r.warehouseId === warehouseId && r.itemId === need.itemId && (need.accept === 'any' || r.condition === 'new'))
    .sort((a, b) => (a.condition === b.condition ? 0 : a.condition === 'new' ? -1 : 1))

/** What to hold in one warehouse: stockId → quantity, new stock first, then used. null when it can't cover the request. */
export function planReservation(need: Need, warehouseId: string, rows: StockRow[]): Record<string, number> | null {
  let left = need.qty
  const plan: Record<string, number> = {}
  for (const r of usable(need, warehouseId, rows)) {
    const take = Math.min(left, Math.max(0, r.qty - r.reserved))
    if (take > 0) { plan[r.id] = take; left -= take }
    if (left === 0) return plan
  }
  return null
}

export function availableIn(need: Need, warehouseId: string, rows: StockRow[]): number {
  return usable(need, warehouseId, rows).reduce((n, r) => n + Math.max(0, r.qty - r.reserved), 0)
}

/** The nearest of the charity's warehouses that covers the whole request on its own. */
export function bestWarehouse(need: Need & { delivery: LatLng }, warehouses: Warehouse[], rows: StockRow[]) {
  let best: { warehouse: Warehouse; available: number; distanceKm: number } | null = null
  for (const w of warehouses) {
    const available = availableIn(need, w.id, rows)
    if (available < need.qty) continue
    const distanceKm = haversineKm(need.delivery, w.location)
    if (!best || distanceKm < best.distanceKm) best = { warehouse: w, available, distanceKm }
  }
  return best
}
