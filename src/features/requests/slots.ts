import { toIsoDate } from '../../components/ui/DatePicker'
import { parseDateInput } from './validate'

export type DateTime = { date: string; time: string }

const pad = (n: number) => String(n).padStart(2, '0')
/** Every half hour of the day, 'HH:MM'. */
export const SLOTS = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`)

/** The first half-hour slot after `now` (may roll over to tomorrow). */
export function nextSlot(now: Date): DateTime {
  const d = new Date(now)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60)
  return { date: toIsoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

export function fromDate(d: Date): DateTime {
  return { date: toIsoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes() < 30 ? 0 : 30)}` }
}

export function combine(v: DateTime): Date | null {
  const day = parseDateInput(v.date)
  const m = /^(\d{2}):(\d{2})$/.exec(v.time)
  if (!day || !m) return null
  day.setHours(+m[1], +m[2])
  return day
}
