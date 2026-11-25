import { describe, expect, it } from 'vitest'
import { makeReceiptCode } from '../../src/features/requests/code'
import { etaText, formatKm, rankCharities } from '../../src/features/requests/rank'
import type { Candidates, CharityInfo, RequestDraft } from '../../src/features/requests/types'
import { parsePhone, validateRequest } from '../../src/features/requests/validate'
import type { StockRow, Warehouse } from '../../src/features/inventory/types'

const CHAIRS = 'كراسي متحركه'
const KFH = { lat: 21.5433, lng: 39.1728 }

function charity(id: string, name: string, warehouses: { id: string; lat: number; lng: number; rows: { c: 'new' | 'used'; qty: number; reserved?: number }[] }[]): Candidates {
  const info: CharityInfo = { id, name, canDeliver: true, workingHours: 'الأحد – الخميس' }
  const whs = warehouses.map(w => ({ id: w.id, orgId: id, name: w.id, city: 'جدة', district: 'حي', location: { lat: w.lat, lng: w.lng }, createdAt: new Date(), updatedAt: new Date() }))
  const rows: StockRow[] = warehouses.flatMap(w => w.rows.map(r => ({
    id: `${w.id}__${CHAIRS}__${r.c}`, orgId: id, orgName: name, orgRole: 'charity' as const, warehouseId: w.id, warehouseName: w.id, city: 'جدة',
    itemId: CHAIRS, itemName: 'كراسي متحركة', condition: r.c, qty: r.qty, reserved: r.reserved ?? 0, updatedAt: new Date(),
  })))
  return { charities: [info], warehouses: whs as (Warehouse & { orgId: string })[], rows }
}
const merge = (...cs: Candidates[]): Candidates => ({ charities: cs.flatMap(c => c.charities), warehouses: cs.flatMap(c => c.warehouses), rows: cs.flatMap(c => c.rows) })
const req = (over: Partial<Parameters<typeof rankCharities>[0]> = {}) => ({ itemId: CHAIRS, qty: 40, accept: 'any' as const, priority: 'urgent' as const, delivery: KFH, ...over })

describe('ranking', () => {
  it('reference ranking matches the prototype', () => {
    const c = merge(
      charity('c1', 'جمعية البر بجدة', [{ id: 'w1', lat: 21.572, lng: 39.17, rows: [{ c: 'new', qty: 50 }] }]),
      charity('c6', 'جمعية الشمال', [{ id: 'w6', lat: 21.596, lng: 39.155, rows: [{ c: 'new', qty: 60 }] }]),
      charity('c7', 'جمعية الشرق', [{ id: 'w7', lat: 21.55, lng: 39.235, rows: [{ c: 'new', qty: 45 }] }]),
      charity('c8', 'جمعية الساحل', [{ id: 'w8', lat: 21.515, lng: 39.125, rows: [{ c: 'new', qty: 12 }] }]),
      charity('c9', 'جمعية الجنوب', [{ id: 'w9', lat: 21.465, lng: 39.195, rows: [{ c: 'new', qty: 8 }] }]),
    )
    const r = rankCharities(req(), c)
    expect(r.map(x => x.charity.name)).toEqual(['جمعية الشمال', 'جمعية البر بجدة', 'جمعية الشرق'])
    expect(r.map(x => x.score)).toEqual([90, 89, 84])
    expect(formatKm(r[0].distanceKm)).toBe('6.1')
  })

  it('a charity split across two warehouses is not suitable', () => {
    const c = charity('c1', 'جمعية', [{ id: 'a', lat: 21.57, lng: 39.17, rows: [{ c: 'new', qty: 30 }] }, { id: 'b', lat: 21.58, lng: 39.17, rows: [{ c: 'new', qty: 30 }] }])
    expect(rankCharities(req(), c)).toEqual([])
  })

  it('accept new counts only new stock', () => {
    const c = charity('c1', 'جمعية', [{ id: 'a', lat: 21.57, lng: 39.17, rows: [{ c: 'new', qty: 10 }, { c: 'used', qty: 40 }] }])
    expect(rankCharities(req({ qty: 20, accept: 'new' }), c)).toEqual([])
    expect(rankCharities(req({ qty: 20, accept: 'any' }), c)[0].available).toBe(50)
  })

  it('reserved stock is not available', () => {
    const c = charity('c1', 'جمعية', [{ id: 'a', lat: 21.57, lng: 39.17, rows: [{ c: 'new', qty: 50, reserved: 20 }] }])
    expect(rankCharities(req(), c)).toEqual([])
  })

  it('picks the best warehouse of a charity', () => {
    const c = charity('c1', 'جمعية', [{ id: 'far', lat: 22.5, lng: 39.9, rows: [{ c: 'new', qty: 60 }] }, { id: 'near', lat: 21.55, lng: 39.18, rows: [{ c: 'new', qty: 60 }] }])
    const r = rankCharities(req(), c)
    expect(r).toHaveLength(1)
    expect(r[0].warehouse.id).toBe('near')
  })

  it('formats distance and time', () => {
    expect(formatKm(6.14)).toBe('6.1')
    expect(formatKm(412.6)).toBe('413')
    expect(etaText(0.7)).toBe('أقل من ساعة')
    expect(etaText(1.2)).toBe('ساعة تقريبًا')
    expect(etaText(2)).toBe('ساعتين تقريبًا')
    expect(etaText(5.4)).toBe('5 ساعات تقريبًا')
  })
})

describe('request validation', () => {
  it('parses Saudi phones', () => {
    for (const ok of ['0551234567', '٠٥٥١٢٣٤٥٦٧', '+966551234567', '966 55 123 4567', '055 123 4567']) expect(parsePhone(ok)).toBe('0551234567')
    for (const bad of ['0451234567', '05512', '', 'abc']) expect(parsePhone(bad)).toBeNull()
  })

  const today = new Date(2026, 10, 25)
  const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({
    item: { kind: 'existing', item: { key: CHAIRS, name: 'كراسي متحركة' } }, qty: '40', accept: 'any', priority: 'urgent', beneficiaries: '40', neededBy: '2026-11-27',
    receiverName: 'أحمد الغامدي', receiverPhone: '0551234567', delivery: { lat: 21.54, lng: 39.17, city: '', district: '', details: '' },
    city: 'جدة', district: 'الشرفية', details: 'البوابة 3', ...over,
  })

  it('accepts a valid draft', () => {
    const { value, errors } = validateRequest(draft(), today)
    expect(errors).toEqual({})
    expect(value).toMatchObject({ qty: 40, beneficiaries: 40, receiver: { name: 'أحمد الغامدي', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' } })
    expect(value!.neededBy.getFullYear()).toBe(2026)
    expect(validateRequest(draft({ neededBy: '25/11/2026' }), today).errors).toEqual({})
    expect(validateRequest(draft({ neededBy: '٢٠٢٦-١١-٢٥' }), today).errors).toEqual({})
    expect(validateRequest(draft({ neededBy: '20261125' }), today).errors).toEqual({})
    expect(validateRequest(draft({ neededBy: '2026 11 25' }), today).errors).toEqual({})
  })

  it('reports each bad field', () => {
    const e = validateRequest(draft({ item: null, qty: '0', beneficiaries: 'x', neededBy: '2026-11-24', receiverName: ' ', receiverPhone: '123', delivery: null, city: 'دبي', district: '', details: 'x'.repeat(101) }), today).errors
    expect(e).toEqual({
      item: 'اختر المنتج', qty: 'اكتب الكمية بالأرقام من 1 إلى 99999', beneficiaries: 'اكتب عدد المستفيدين بالأرقام', neededBy: 'اختر تاريخ اليوم او بعده',
      receiverName: 'اكتب اسم المستلم', receiverPhone: 'رقم جوال سعودي يبدأ بـ 05', delivery: 'حدد مكان التسليم على الخريطة', city: 'اختر المدينة', district: 'اكتب الحي',
      details: 'التفاصيل 100 حرف بالكثير',
    })
  })
})

it('receipt codes are four digits', () => {
  expect(makeReceiptCode(() => 0)).toBe('0000')
  expect(makeReceiptCode(() => 0.99999)).toBe('9999')
  expect(makeReceiptCode()).toMatch(/^\d{4}$/)
})
