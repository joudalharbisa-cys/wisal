import { buildTimeline, formatDateTime, type Viewer } from './timeline'
import type { HospitalRequest } from './types'

/** Dated timeline: done steps green with date/time, future steps grey, a rejection in orange. */
export default function Timeline({ request, viewer }: { request: HospitalRequest; viewer: Viewer }) {
  const steps = buildTimeline(request, viewer)
  return (
    <ol aria-label="مراحل الطلب" className="relative space-y-4 ps-6 before:absolute before:inset-y-1 before:start-[7px] before:w-0.5 before:bg-line">
      {steps.map((s, i) => {
        const done = !!s.at
        return (
          <li key={`${i}-${s.label}`} className="relative">
            <span aria-hidden className={`absolute -start-6 top-1 size-4 rounded-full border-2 ${s.warn ? 'border-medium bg-medium' : done ? 'border-primary bg-primary' : 'border-line bg-white'}`} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className={`text-sm ${done ? 'font-bold' : 'text-muted'}`}>{s.label}</span>
              <span className="text-xs text-muted tabular-nums">{s.at ? formatDateTime(s.at) : '—'}</span>
            </div>
            {s.note && <div className="mt-1 text-xs text-muted">{s.note}</div>}
          </li>
        )
      })}
    </ol>
  )
}
