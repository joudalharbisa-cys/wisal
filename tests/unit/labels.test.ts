import { it, expect } from 'vitest'
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_SHORT } from '../../src/lib/labels'

it('priority labels match the spec', () => {
  expect(PRIORITY_LABEL).toEqual({ urgent: 'عاجلة', medium: 'متوسطة', normal: 'عادية' })
})

it('status labels match the spec', () => {
  expect(STATUS_LABEL[0]).toBe('بانتظار جهة مناسبة')
  expect(STATUS_LABEL[1]).toBe('بانتظار موافقة الجمعية')
  expect(STATUS_LABEL[2]).toBe('تمت الموافقة')
  expect(STATUS_LABEL[3]).toBe('قيد التسليم')
  expect(STATUS_LABEL[4]).toBe('تم التسليم، بانتظار التحقق')
  expect(STATUS_LABEL[5]).toBe('تم التحقق من الوصول')
})

it('short status labels follow status order', () => {
  expect(Object.values(STATUS_SHORT)).toEqual(['بانتظار', 'مطابقة', 'موافقة', 'تسليم', 'وصول', 'تحقق'])
})
