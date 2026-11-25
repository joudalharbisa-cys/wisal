import { CITIES } from '../orgs/cities'
import { parseQty, inSaudiBox } from '../inventory/validate'
import type { RequestDraft, ValidRequest } from './types'
import { toWesternDigits } from '../../lib/digits'

export { toWesternDigits }

/** Saudi mobile: starts with 05 and exactly 10 digits (Arabic-Indic digits accepted). */
export function parsePhone(s: string): string | null {
  const d = toWesternDigits(s).trim()
  return /^05\d{8}$/.test(d) ? d : null
}

/** 'YYYY-MM-DD' or 'D/M/YYYY' (Western or Arabic-Indic digits) → local midnight, else null. */
export function parseDateInput(s: string): Date | null {
  const t = toWesternDigits(s).trim()
  let y: number, m: number, d: number
  // Year first with any separator (phone keypads may only offer spaces or dots), compact YYYYMMDD, or day first.
  let match = /^(\d{4})[\s./-]+(\d{1,2})[\s./-]+(\d{1,2})$/.exec(t) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(t)
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]]
  else if ((match = /^(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})$/.exec(t))) [d, m, y] = [+match[1], +match[2], +match[3]]
  else return null
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** The latest deadline a request may ask for: the same day next year. */
export const lastAllowedDay = (today: Date) => new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())

type Field = 'item' | 'qty' | 'beneficiaries' | 'neededBy' | 'receiverName' | 'receiverPhone' | 'delivery' | 'city' | 'district' | 'details'

export function validateRequest(d: RequestDraft, today: Date): { value?: ValidRequest; errors: Partial<Record<Field, string>> } {
  const e: Partial<Record<Field, string>> = {}
  if (!d.item) e.item = 'اختر المنتج'
  const qty = parseQty(d.qty)
  if (qty === null || qty < 1) e.qty = 'اكتب الكمية بالأرقام من 1 إلى 99999'
  const ben = toWesternDigits(d.beneficiaries).trim()
  const beneficiaries = /^\d{1,7}$/.test(ben) ? Number(ben) : NaN
  if (!(beneficiaries >= 1 && beneficiaries <= 1_000_000)) e.beneficiaries = 'اكتب عدد المستفيدين بالأرقام'
  const neededBy = parseDateInput(d.neededBy)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!neededBy || neededBy < startOfToday || neededBy > lastAllowedDay(today)) e.neededBy = 'اختر تاريخ من اليوم لين سنة قدام'
  const name = d.receiverName.trim()
  if (name.length < 2 || name.length > 60) e.receiverName = 'اكتب اسم المستلم'
  const phone = parsePhone(d.receiverPhone)
  if (!phone) e.receiverPhone = 'رقم الجوال لازم يبدأ بـ 05 ويكون 10 أرقام'
  if (!d.delivery || !inSaudiBox(d.delivery)) e.delivery = 'حدد مكان التسليم على الخريطة'
  if (!(CITIES as readonly string[]).includes(d.city)) e.city = 'اختر المدينة'
  const district = d.district.trim()
  if (district.length < 1 || district.length > 60) e.district = 'اكتب الحي'
  const details = d.details.trim()
  if (details.length > 100) e.details = 'التفاصيل 100 حرف بالكثير'
  if (Object.keys(e).length > 0) return { errors: e }
  return {
    errors: {},
    value: {
      item: d.item!, qty: qty!, accept: d.accept, priority: d.priority, beneficiaries, neededBy: neededBy!,
      receiver: { name, phone: phone! },
      delivery: { lat: d.delivery!.lat, lng: d.delivery!.lng, city: d.city, district, details },
    },
  }
}
