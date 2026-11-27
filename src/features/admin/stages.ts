import type { StockRow } from '../inventory/types'
import { availableIn } from '../requests/reserve'
import type { HospitalRequest } from '../requests/types'

export type Stage = 'open' | 'waitingHospital' | 'waitingCharity' | 'approved' | 'preparing' | 'out' | 'arrived' | 'verified'

/** The admin's eight stages, in journey order (status 0 split by `open`). */
export const STAGES: { key: Stage; label: string }[] = [
  { key: 'open', label: 'طلب مفتوح' },
  { key: 'waitingHospital', label: 'بانتظار قرار المستشفى' },
  { key: 'waitingCharity', label: 'بانتظار موافقة الجمعية' },
  { key: 'approved', label: 'تمت الموافقة' },
  { key: 'preparing', label: 'تجهيز الطلب' },
  { key: 'out', label: 'قيد التوصيل / جاهز للاستلام' },
  { key: 'arrived', label: 'وصل، بانتظار الرمز' },
  { key: 'verified', label: 'تم التحقق' },
]

const BY_STATUS: Stage[] = ['open', 'waitingCharity', 'approved', 'preparing', 'out', 'arrived', 'verified']

export function stageOf(r: HospitalRequest): Stage {
  if (r.status === 0) return r.open ? 'open' : 'waitingHospital'
  return BY_STATUS[r.status]
}

/** Past its deadline day and not yet arrived. */
export function isLate(r: HospitalRequest, now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return r.neededBy < today && r.status < 5
}

/** Code entry locked after five counted wrong codes. */
export const isLocked = (r: HospitalRequest) => r.status === 5 && (r.codeFails ?? 0) >= 5

/** An open request no single warehouse of an approved charity can cover (same rule as the hospital's ranking).
 *  `approved`: ids of approved charities; rows of others don't count. */
export function uncovered(r: HospitalRequest, rows: StockRow[], approved?: Set<string>): boolean {
  if (r.status !== 0 || !r.open) return false
  const usable = rows.filter(x => x.orgRole === 'charity' && (!approved || approved.has(x.orgId)))
  const places = new Set(usable.map(x => `${x.orgId}\u0000${x.warehouseId}`))
  for (const p of places) {
    const [orgId, warehouseId] = p.split('\u0000')
    if (availableIn(r, warehouseId, usable.filter(x => x.orgId === orgId)) >= r.qty) return false
  }
  return true
}
