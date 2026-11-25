import { it, expect } from 'vitest'
import { validateApplication } from '../../src/features/orgs/validate'
import { CITIES } from '../../src/features/orgs/cities'
import { CONTRACT } from '../../src/features/orgs/contract'

const hospital = { role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov' } as const
const charity = { role: 'charity', name: 'جمعية الشمال', city: 'جدة', district: 'النعيم', licenseNo: '4521', workingHours: 'الأحد-الخميس 8ص-4م', canDeliver: false } as const

it('accepts a complete hospital application', () => {
  expect(validateApplication(hospital)).toEqual({})
})

it('requires hospital type for hospitals', () => {
  expect(validateApplication({ ...hospital, hospitalType: undefined })).toEqual({ hospitalType: 'اختر نوع المستشفى' })
})

it('trims before checking the name', () => {
  expect(validateApplication({ ...hospital, name: '  ' }).name).toBe('اكتب اسم الجهة')
})

it('rejects malformed license numbers', () => {
  expect(validateApplication({ ...hospital, licenseNo: '12' }).licenseNo).toBe('رقم الترخيص غير صحيح')
  expect(validateApplication({ ...hospital, licenseNo: 'ABC 123' }).licenseNo).toBe('رقم الترخيص غير صحيح')
})

it('only accepts listed cities', () => {
  expect(validateApplication({ ...hospital, city: 'لندن' }).city).toBe('اختر المدينة')
  expect(CITIES).toContain('جدة')
})

it('requires district', () => {
  expect(validateApplication({ ...hospital, district: '' }).district).toBe('اكتب الحي')
})

it('accepts a complete charity application and checks its own fields', () => {
  expect(validateApplication(charity)).toEqual({})
  expect(validateApplication({ ...charity, canDeliver: undefined }).canDeliver).toBe('حدد إذا عندكم توصيل')
  expect(validateApplication({ ...charity, workingHours: ' ' }).workingHours).toBe('اكتب أوقات العمل')
})

it('contract is the draft version with clauses', () => {
  expect(CONTRACT.version).toBe('1.0-draft')
  expect(CONTRACT.clauses.length).toBeGreaterThan(1)
})
