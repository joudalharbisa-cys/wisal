import type { HospitalRequest, Person } from './types'

export type Viewer = 'hospital' | 'charity'
/** One line of the dated timeline; `at` missing = not reached yet. */
export type Step = { label: string; at?: Date; note?: string; warn?: boolean }

const LOCALE = 'ar-SA-u-nu-latn-ca-gregory'

/** «الأربعاء 26 نوفمبر · 1:40 م» — Western digits, 12-hour clock. */
export function formatDateTime(d: Date): string {
  const weekday = d.toLocaleDateString(LOCALE, { weekday: 'long' })
  const day = d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })
  return `${weekday} ${day} · ${formatTime(d)}`
}

export function formatTime(d: Date): string {
  const h = d.getHours() % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'ص' : 'م'}`
}

export const personLine = (role: string, p: Person, when: string) => `${role}: ${p.name} · ${p.phone} · ${when} ${formatDateTime(p.eta)}`

/** Where the request went most recently: sent to a charity, or published as open. */
function dispatch(r: HospitalRequest, viewer: Viewer): Step {
  const published = r.publishedAt && (!r.sentAt || r.publishedAt >= r.sentAt)
  if (published) return { label: 'انتشر كطلب مفتوح', at: r.publishedAt }
  if (viewer === 'charity') return { label: 'وصلك الطلب', at: r.sentAt ?? r.createdAt }
  return { label: r.charityName ? `أُرسل ل${r.charityName}` : 'أُرسل للجمعية', at: r.sentAt ?? r.createdAt }
}

/** Every step of the request with its date; rejections by other charities are shown to the hospital only. */
export function buildTimeline(r: HospitalRequest, viewer: Viewer): Step[] {
  const steps: Step[] = []
  const rej = viewer === 'hospital' ? r.lastRejection : undefined
  const current = dispatch(r, viewer)
  if (rej) {
    steps.push({ label: 'أُرسل للجمعية', at: r.createdAt })
    steps.push({ label: `رفضت ${rej.charityName} الطلب`, at: rej.at, warn: true, note: rej.reason ? `السبب: ${rej.reason}` : undefined })
    if (current.at && current.at > rej.at) steps.push(current)
  } else steps.push(current)

  const pickup = r.mode === 'pickup'
  const outNote = pickup
    ? r.pickup && personLine('مندوب المستشفى', r.pickup, 'يجي')
    : r.driver && personLine('السائق', r.driver, 'يوصل تقريبًا')
  steps.push(
    { label: viewer === 'charity' ? 'قبلت الطلب' : 'تمت الموافقة', at: r.acceptedAt },
    { label: 'بدأ التجهيز', at: r.preparingAt },
    { label: pickup ? 'جاهز للاستلام' : r.mode ? 'طلع للتوصيل' : 'التوصيل او الاستلام', at: r.outAt, note: outNote || undefined },
    { label: pickup ? 'وصل مندوب المستشفى' : 'وصل', at: r.arrivedAt },
    { label: 'تم التحقق', at: r.verifiedAt },
  )
  return steps
}

/** The most recent dated step, for lists. */
export function latestStep(r: HospitalRequest, viewer: Viewer = 'hospital'): Step | undefined {
  return buildTimeline(r, viewer).filter(s => s.at).sort((a, b) => a.at!.getTime() - b.at!.getTime()).at(-1)
}
