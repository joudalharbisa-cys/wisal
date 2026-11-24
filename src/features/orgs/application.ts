import type { Org, OrgApplication } from './types'

export type Draft = Partial<OrgApplication>

/** Only the fields that belong to the chosen role, trimmed. Call after validateApplication passes. */
export function toApplication(d: Draft): OrgApplication {
  const base = { role: d.role!, name: d.name!.trim(), city: d.city!, district: d.district!.trim(), licenseNo: d.licenseNo!.trim() }
  return d.role === 'hospital'
    ? { ...base, hospitalType: d.hospitalType }
    : { ...base, workingHours: d.workingHours!.trim(), canDeliver: d.canDeliver }
}

/** Prefill a form from a stored org. */
export function draftFromOrg(o: Org): Draft {
  return {
    role: o.role, name: o.name, city: o.city, district: o.district, licenseNo: o.licenseNo,
    hospitalType: o.hospitalType, workingHours: o.workingHours, canDeliver: o.canDeliver,
  }
}
