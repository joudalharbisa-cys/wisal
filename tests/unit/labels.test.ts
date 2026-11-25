import { it, expect } from 'vitest'
import { PRIORITY_LABEL, STATUS_SHORT, statusLabel } from '../../src/lib/labels'

it('priority labels match the spec', () => {
  expect(PRIORITY_LABEL).toEqual({ urgent: 'عاجلة', medium: 'متوسطة', normal: 'عادية' })
})

it('status labels follow the 7 steps, by open flag and delivery mode', () => {
  expect(statusLabel(0, { open: true })).toBe('طلب مفتوح')
  expect(statusLabel(0, { open: false })).toBe('بانتظار قرارك')
  expect(statusLabel(1)).toBe('بانتظار موافقة الجمعية')
  expect(statusLabel(2)).toBe('تمت الموافقة')
  expect(statusLabel(3)).toBe('تجهيز الطلب')
  expect(statusLabel(4, { mode: 'delivery' })).toBe('قيد التوصيل')
  expect(statusLabel(4, { mode: 'pickup' })).toBe('جاهز للاستلام')
  expect(statusLabel(5)).toBe('وصل، بانتظار الرمز')
  expect(statusLabel(6)).toBe('تم التحقق من الوصول')
})

it('the hospital never sees the verification step: arrival and after both read «وصل»', () => {
  expect(statusLabel(5, { hospital: true })).toBe('وصل')
  expect(statusLabel(6, { hospital: true })).toBe('وصل')
  expect(statusLabel(4, { hospital: true, mode: 'delivery' })).toBe('قيد التوصيل')
})

it('short status labels follow status order', () => {
  expect(Object.values(STATUS_SHORT)).toEqual(['بانتظار', 'مطابقة', 'موافقة', 'تجهيز', 'توصيل', 'وصول', 'تحقق'])
})
