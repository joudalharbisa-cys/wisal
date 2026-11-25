import { Clock, MapPin, Truck } from 'lucide-react'
import Button from '../../components/ui/Button'
import { etaText, formatKm } from './rank'
import type { Ranked } from './types'

const CARD = 'rounded-card border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

/** Ranked charities, best first; one can be chosen. */
export default function RankingList({ ranked, chosen, onChoose, rejectedBefore = [] }: { ranked: Ranked[]; chosen: string | null; onChoose: (charityId: string) => void; rejectedBefore?: string[] }) {
  return (
    <ul aria-label="الجمعيات المناسبة" className="space-y-3">
      {ranked.map((r, i) => {
        const on = r.charity.id === chosen
        return (
          <li key={r.charity.id} className={`${CARD} flex flex-wrap items-center gap-5 px-5 py-4 transition ${on ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${i === 0 ? 'bg-accent text-white' : 'bg-surface text-muted'}`}>{i + 1}</span>
            <div className="min-w-48 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{r.charity.name}</h3>
                {rejectedBefore.includes(r.charity.id) && <span className="rounded-full bg-medium/10 px-2 py-0.5 text-[11px] font-medium text-medium">رفضت الطلب قبل</span>}
                {r.charity.canDeliver && <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-medium text-primary-dark"><Truck className="size-3" /> توصّل</span>}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1"><MapPin className="size-3.5" /><span className="tabular-nums">{formatKm(r.distanceKm)}</span> كم</span>
                <span className="flex items-center gap-1"><Clock className="size-3.5" />{etaText(r.etaHours)}</span>
                {r.charity.workingHours && <span>{r.charity.workingHours}</span>}
              </p>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted">المتاح</div>
              <div className="text-lg font-bold tabular-nums">{r.available}</div>
            </div>
            <div className="w-36">
              <div className="flex items-baseline justify-between text-xs text-muted"><span>المطابقة</span><b className="text-lg text-primary tabular-nums">{r.score}</b></div>
              <div className="mt-1 h-2 rounded-full bg-line" aria-hidden><div className="h-2 rounded-full bg-primary" style={{ width: `${r.score}%` }} /></div>
            </div>
            <Button variant={on ? 'primary' : 'outline'} aria-pressed={on} aria-label={`اختر ${r.charity.name}`} onClick={() => onChoose(r.charity.id)}>{on ? 'مختارة' : 'اختر'}</Button>
          </li>
        )
      })}
    </ul>
  )
}
