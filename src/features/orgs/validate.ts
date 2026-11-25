import { CITIES } from './cities'
import type { OrgApplication } from './types'

export type ApplicationErrors = Partial<Record<keyof OrgApplication, string>>

const LICENSE = /^[0-9A-Za-z-]{3,30}$/

export function validateApplication(a: Partial<OrgApplication>): ApplicationErrors {
  const e: ApplicationErrors = {}
  const t = (v?: string) => (v ?? '').trim()
  if (t(a.name).length < 2) e.name = 'اكتب اسم الجهة'
  if (!(CITIES as readonly string[]).includes(t(a.city))) e.city = 'اختر المدينة'
  if (!t(a.district)) e.district = 'اكتب الحي'
  if (!LICENSE.test(t(a.licenseNo))) e.licenseNo = 'رقم الترخيص غير صحيح'
  if (a.role === 'hospital' && !a.hospitalType) e.hospitalType = 'اختر نوع المستشفى'
  if (a.role === 'charity') {
    if (!t(a.workingHours)) e.workingHours = 'اكتب أوقات العمل'
    if (typeof a.canDeliver !== 'boolean') e.canDeliver = 'حدد إذا عندكم توصيل'
  }
  return e
}
