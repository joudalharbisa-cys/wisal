import { describe, expect, it } from 'vitest'
import { buildTimeline, formatDateTime, latestStep } from '../../src/features/requests/timeline'
import type { HospitalRequest } from '../../src/features/requests/types'

const t = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m)
const base = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: 'k', itemName: 'كراسي', qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: t(28, 0), delivery: { lat: 21.5, lng: 39.1, city: 'جدة', district: 'حي', details: '' }, status: 1, open: false, excluded: [],
  charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wc', createdAt: t(25, 10, 24), sentAt: t(25, 10, 24), updatedAt: t(25, 10, 24), ...over,
})
const labels = (steps: { label: string }[]) => steps.map(s => s.label)
const done = (steps: { at?: Date }[]) => steps.filter(s => s.at).length

describe('timeline', () => {
  it('delivery journey for the hospital, future steps without a time', () => {
    const r = base({ status: 4, mode: 'delivery', acceptedAt: t(25, 11, 2), preparingAt: t(26, 8, 15), outAt: t(26, 13, 40), driver: { name: 'فهد العتيبي', phone: '0551112222', eta: t(26, 14, 30) } })
    const s = buildTimeline(r, 'hospital')
    expect(labels(s)).toEqual(['أُرسل لجمعية البر', 'تمت الموافقة', 'بدأ التجهيز', 'طلع للتوصيل', 'وصل'])
    expect(labels(buildTimeline(r, 'charity')).at(-1)).toBe('تم التحقق') // only the charity sees the code step
    expect(done(s)).toBe(4)
    expect(s[3].note).toContain('فهد العتيبي')
    expect(s[3].note).toContain('0551112222')
  })

  it('a rejection and a re-send show in order', () => {
    const r = base({ createdAt: t(25, 9), sentAt: t(25, 11), lastRejection: { charityName: 'جمعية الشمال', reason: 'مشغولين', at: t(25, 10) } })
    const s = buildTimeline(r, 'hospital')
    expect(labels(s).slice(0, 4)).toEqual(['أُرسل للجمعية', 'رفضت جمعية الشمال الطلب', 'أُرسل لجمعية البر', 'تمت الموافقة'])
    expect(s[1].warn).toBe(true)
    expect(s[1].note).toContain('مشغولين')
  })

  it('pickup wording', () => {
    const r = base({ status: 5, mode: 'pickup', acceptedAt: t(25, 11), preparingAt: t(25, 12), outAt: t(26, 8), arrivedAt: t(26, 9), pickup: { name: 'سعد', phone: '0553334444', eta: t(26, 9) } })
    const s = buildTimeline(r, 'hospital')
    expect(labels(s)).toContain('جاهز للاستلام')
    expect(labels(s)).toContain('وصل مندوب المستشفى')
    expect(s.find(x => x.label === 'جاهز للاستلام')?.note).toContain('سعد')
  })

  it('the charity sees its own wording and not other charities’ rejections', () => {
    const r = base({ status: 2, acceptedAt: t(25, 11), lastRejection: { charityName: 'جمعية الشمال', reason: '', at: t(25, 10) } })
    const s = buildTimeline(r, 'charity')
    expect(labels(s).slice(0, 2)).toEqual(['وصلك الطلب', 'قبلت الطلب'])
    expect(labels(s).join()).not.toContain('رفضت')
  })

  it('an open request starts with its publication', () => {
    const r = base({ status: 0, open: true, charityId: undefined, charityName: undefined, sentAt: undefined, publishedAt: t(25, 9) })
    expect(buildTimeline(r, 'hospital')[0]).toMatchObject({ label: 'انتشر كطلب مفتوح' })
  })

  it('formats date and time with Western digits and gives the latest step', () => {
    const f = formatDateTime(t(26, 13, 40))
    expect(f).toContain('26 نوفمبر')
    expect(f).toContain('1:40')
    expect(f).not.toMatch(/[٠-٩]/)
    const r = base({ status: 3, mode: 'delivery', acceptedAt: t(25, 11), preparingAt: t(26, 8, 15) })
    expect(latestStep(r)).toMatchObject({ label: 'بدأ التجهيز' })
  })
})
