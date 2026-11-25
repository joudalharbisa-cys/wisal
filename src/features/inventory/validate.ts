import { CITIES } from '../orgs/cities'
import { MAX_QTY, type LatLng, type WarehouseDraft } from './types'

/** Accepts Western and Arabic-Indic digits; whole numbers 0–99999 only. */
export function parseQty(s: string): number | null {
  const ascii = s.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
  if (!/^\d{1,5}$/.test(ascii)) return null
  const n = Number(ascii)
  return n <= MAX_QTY ? n : null
}

/** A typed coordinate: Western or Arabic-Indic digits, "." or "٫" as the decimal point. */
export function parseCoord(s: string): number | null {
  const t = s.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/٫/g, '.')
  return /^-?\d{1,3}(\.\d+)?$/.test(t) ? Number(t) : null
}

export function inSaudiBox(p: LatLng): boolean {
  return p.lat >= 16 && p.lat <= 33 && p.lng >= 34 && p.lng <= 56
}

export function validateItemName(s: string): string | undefined {
  const n = s.trim().length
  // At least one letter or digit, so the key is never "." or ".." (invalid doc ids).
  return n >= 2 && n <= 60 && /[\p{L}\p{N}]/u.test(s) ? undefined : 'اسم المنتج من 2 إلى 60 حرف'
}

export function validateWarehouse(d: WarehouseDraft): Partial<Record<'name' | 'city' | 'district' | 'location', string>> {
  const e: Partial<Record<'name' | 'city' | 'district' | 'location', string>> = {}
  const name = d.name.trim()
  if (name.length < 2 || name.length > 60) e.name = 'اكتب اسم المستودع (حرفين على الأقل)'
  if (!(CITIES as readonly string[]).includes(d.city)) e.city = 'اختر المدينة'
  const district = d.district.trim()
  if (district.length < 1 || district.length > 60) e.district = 'اكتب الحي'
  if (!d.location) e.location = 'حدد موقع المستودع على الخريطة'
  else if (!inSaudiBox(d.location)) e.location = 'الموقع لازم يكون داخل السعودية'
  return e
}
