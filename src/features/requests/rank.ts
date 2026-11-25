import type { Priority } from '../../lib/labels'
import type { LatLng } from '../inventory/types'
import type { Accept, Candidates, Ranked } from './types'

// Prototype formula (tech plan §6): weights distance/stock/time and target windows per priority.
const WEIGHTS: Record<Priority, [number, number, number]> = { urgent: [0.4, 0.25, 0.35], medium: [0.35, 0.35, 0.3], normal: [0.3, 0.5, 0.2] }
const WINDOW_HOURS: Record<Priority, number> = { urgent: 6, medium: 24, normal: 72 }

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const k = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(k))
}

/**
 * Charities that can cover the whole quantity from one warehouse, best first.
 * Each charity is ranked by its best-scoring suitable warehouse.
 */
export function rankCharities(req: { itemId: string; qty: number; accept: Accept; priority: Priority; delivery: LatLng }, c: Candidates): Ranked[] {
  const [w1, w2, w3] = WEIGHTS[req.priority]
  const best = new Map<string, Ranked>()
  for (const wh of c.warehouses) {
    const charity = c.charities.find(x => x.id === wh.orgId)
    if (!charity) continue
    const available = c.rows
      .filter(r => r.orgId === wh.orgId && r.warehouseId === wh.id && r.itemId === req.itemId && (req.accept === 'any' || r.condition === 'new'))
      .reduce((n, r) => n + Math.max(0, r.qty - r.reserved), 0)
    if (available < req.qty) continue
    const d = haversineKm(req.delivery, wh.location)
    const eta = (d * 1.3) / 45 + 0.5
    const score = Math.round(100 * (w1 * Math.exp(-d / 40) + w2 * Math.min(1, available / (req.qty * 1.5)) + w3 * Math.max(0, 1 - eta / WINDOW_HOURS[req.priority])))
    const prev = best.get(charity.id)
    if (!prev || score > prev.score || (score === prev.score && d < prev.distanceKm))
      best.set(charity.id, { charity, warehouse: wh, available, distanceKm: d, etaHours: eta, score })
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
}

export function formatKm(d: number): string {
  return d < 100 ? (Math.round(d * 10) / 10).toFixed(1) : String(Math.round(d))
}

export function etaText(h: number): string {
  if (h < 1) return 'أقل من ساعة'
  if (h < 1.5) return 'ساعة تقريبًا'
  if (h < 2.5) return 'ساعتين تقريبًا'
  return `${Math.round(h)} ساعات تقريبًا`
}
