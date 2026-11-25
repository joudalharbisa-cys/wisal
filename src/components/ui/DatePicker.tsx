import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { inputClass } from './Input'

const LOCALE = 'ar-SA-u-nu-latn-ca-gregory'
const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

const pad = (n: number) => String(n).padStart(2, '0')
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth()
const fullDate = (d: Date) => d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const monthTitle = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })

/** Calendar date field (value 'YYYY-MM-DD'); only days between min and max can be picked. Western digits. */
export default function DatePicker({ label, value, onChange, min, max, error }: { label: string; value: string; onChange: (v: string) => void; min: Date; max: Date; error?: string }) {
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const selected = fromIso(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => { const d = selected ?? min; return { y: d.getFullYear(), m: d.getMonth() } })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown) }
  }, [open])

  const lo = dayStart(min)
  const hi = dayStart(max)
  const cur = view.y * 12 + view.m
  const first = new Date(view.y, view.m, 1)
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (Date | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => new Date(view.y, view.m, i + 1))]
  const move = (delta: number) => setView(v => { const n = v.y * 12 + v.m + delta; return { y: Math.floor(n / 12), m: n % 12 } })

  return (
    <div ref={wrap} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
        onClick={() => { if (selected) setView({ y: selected.getFullYear(), m: selected.getMonth() }); setOpen(o => !o) }}
        className={`${inputClass} flex items-center gap-2 text-start ${error ? 'border-urgent focus:ring-urgent/15' : 'border-line focus:border-primary focus:ring-primary-light'}`}>
        <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
        <span className={selected ? '' : 'text-muted'}>{selected ? fullDate(selected) : 'اختر التاريخ'}</span>
      </button>
      {error && <span id={`${id}-err`} role="alert" className="mt-1 block text-xs text-urgent">{error}</span>}
      {open && (
        <div role="dialog" aria-label="اختر التاريخ" className="absolute start-0 top-full z-20 mt-1 w-72 rounded-card border border-line bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="الشهر السابق" disabled={cur <= monthIndex(lo)} onClick={() => move(-1)} className="grid size-8 place-items-center rounded-control text-muted hover:bg-surface disabled:opacity-30"><ChevronRight className="size-4" /></button>
            <span className="text-sm font-bold">{monthTitle(view.y, view.m)}</span>
            <button type="button" aria-label="الشهر الجاي" disabled={cur >= monthIndex(hi)} onClick={() => move(1)} className="grid size-8 place-items-center rounded-control text-muted hover:bg-surface disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted" aria-hidden>{WEEKDAYS.map(w => <span key={w}>{w}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />
              const off = d < lo || d > hi
              const on = !!selected && toIsoDate(d) === toIsoDate(selected)
              return (
                <button key={i} type="button" disabled={off} aria-pressed={on} aria-label={fullDate(d)} onClick={() => { onChange(toIsoDate(d)); setOpen(false) }}
                  className={`h-8 rounded-control text-sm tabular-nums transition ${on ? 'bg-primary font-bold text-white' : off ? 'text-muted/40' : 'hover:bg-primary-light'}`}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
