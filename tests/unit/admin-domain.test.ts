import { describe, expect, it } from 'vitest'
import { isLate, isLocked, stageOf, STAGES, uncovered } from '../../src/features/admin/stages'
import { eventSteps } from '../../src/features/admin/adminTimeline'
import { buildTimeline } from '../../src/features/requests/timeline'
import type { RequestEvent } from '../../src/features/requests/events'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { StockRow } from '../../src/features/inventory/types'

const t = (d: number, h = 9, m = 0) => new Date(2026, 10, d, h, m)
const base = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: 'k', itemName: 'كراسي', qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: t(28, 0), delivery: { lat: 21.5, lng: 39.1, city: 'جدة', district: 'حي', details: '' }, status: 1, open: false, excluded: [],
  charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', createdAt: t(25), updatedAt: t(25), ...over,
})
const row = (orgId: string, wh: string, qty: number, reserved = 0, condition: 'new' | 'used' = 'new'): StockRow => ({
  id: `${wh}__k__${condition}`, orgId, orgName: orgId, orgRole: 'charity', warehouseId: wh, warehouseName: wh, city: 'جدة', itemId: 'k', itemName: 'كراسي', condition, qty, reserved, updatedAt: t(25),
})
const ev = (n: number, type: RequestEvent['type'], over: Partial<RequestEvent> = {}): RequestEvent =>
  ({ n, requestId: 'r1', type, at: t(25, 9, n), byRole: 'charity', byName: 'جمعية البر', ...over })

describe('admin stages and attention', () => {
  it('every status maps to one stage, waiting hospital apart from open', () => {
    expect(STAGES.map(s => s.key)).toEqual(['open', 'waitingHospital', 'waitingCharity', 'approved', 'preparing', 'out', 'arrived', 'verified'])
    expect(stageOf(base({ status: 0, open: true }))).toBe('open')
    expect(stageOf(base({ status: 0, open: false }))).toBe('waitingHospital')
    expect([1, 2, 3, 4, 5, 6].map(s => stageOf(base({ status: s as HospitalRequest['status'] })))).toEqual(['waitingCharity', 'approved', 'preparing', 'out', 'arrived', 'verified'])
  })
  it('late = past the deadline day and not yet arrived', () => {
    const now = t(29, 10)
    expect(isLate(base({ neededBy: t(28, 0), status: 4 }), now)).toBe(true)
    expect(isLate(base({ neededBy: t(28, 0), status: 5 }), now)).toBe(false)
    expect(isLate(base({ neededBy: t(29, 0), status: 2 }), now)).toBe(false) // the deadline day itself isn't late yet
  })
  it('locked = arrived with five counted wrong codes', () => {
    expect(isLocked(base({ status: 5, codeFails: 5 }))).toBe(true)
    expect(isLocked(base({ status: 5, codeFails: 4 }))).toBe(false)
  })
  it('an open request is uncovered when no single charity warehouse holds the quantity', () => {
    const open = base({ status: 0, open: true, qty: 40, accept: 'new' })
    expect(uncovered(open, [row('c1', 'w', 30), row('c2', 'w', 20)])).toBe(true) // same warehouse id, different charities: not summed
    expect(uncovered(open, [row('c1', 'w', 30), row('c1', 'w', 20, 0, 'used')])).toBe(true) // used doesn't count for «جديد بس»
    expect(uncovered(open, [row('c2', 'w', 45, 5)])).toBe(false)
    expect(uncovered(base({ status: 1 }), [])).toBe(false) // only open requests
    // Only approved charities count (the hospital's ranking ignores pending/rejected ones).
    expect(uncovered(open, [row('c9', 'w', 99)], new Set(['c1']))).toBe(true)
    expect(uncovered(open, [row('c1', 'w', 99)], new Set(['c1']))).toBe(false)
  })
})

describe('admin timeline', () => {
  it('labels every log entry; a code attempt followed by «verified» is the right code', () => {
    const steps = eventSteps([
      ev(1, 'sent', { byRole: 'hospital', byName: 'مستشفى الملك فهد', charityName: 'جمعية الشمال' }),
      ev(2, 'rejected', { byName: 'جمعية الشمال', detail: 'مشغولين' }),
      ev(3, 'returned', { byRole: 'admin', byName: 'إدارة وصال', charityName: 'جمعية الشرق', detail: 'ما ردت' }),
      ev(4, 'published', { byRole: 'hospital', byName: 'مستشفى الملك فهد' }),
      ev(5, 'taken'),
      ev(6, 'dispatched', { detail: 'السائق: فهد' }),
      ev(7, 'codeAttempt', { count: 1 }),
      ev(8, 'codeAttempt', { count: 2 }),
      ev(9, 'verified'),
      ev(10, 'note', { byRole: 'admin', byName: 'إدارة وصال', detail: 'تواصلنا' }),
    ])
    expect(steps.map(s => s.label)).toEqual([
      'أُرسل لجمعية الشمال', 'رفضت جمعية الشمال الطلب', 'أرجعت إدارة وصال الطلب من جمعية الشرق', 'انتشر كطلب مفتوح', 'أخذته جمعية البر',
      'طلع للتوصيل', 'محاولة رمز غلط (1 من 5)', 'كتبت جمعية البر الرمز الصحيح', 'تم التحقق', 'ملاحظة من إدارة وصال',
    ])
    expect(steps[1]).toMatchObject({ warn: true, note: 'السبب: مشغولين' })
    expect(steps[2].note).toBe('السبب: ما ردت')
    expect(steps[5].note).toBe('السائق: فهد')
    expect(steps[9].note).toBe('تواصلنا')
    for (const s of steps) expect(s.at).toBeInstanceOf(Date)
  })
  it('without a log the admin sees the step dates, including the code check', () => {
    const r = base({ status: 6, mode: 'delivery', acceptedAt: t(25, 11), preparingAt: t(26), outAt: t(26, 13), arrivedAt: t(26, 14), verifiedAt: t(26, 15) })
    expect(buildTimeline(r, 'admin').at(-1)).toMatchObject({ label: 'تم التحقق', at: t(26, 15) })
  })
})
