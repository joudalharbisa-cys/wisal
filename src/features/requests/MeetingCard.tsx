import { useId, useState } from 'react'
import { Pencil, Trash2, Video } from 'lucide-react'
import Button from '../../components/ui/Button'
import Dialog from '../../components/ui/Dialog'
import Input from '../../components/ui/Input'
import { useServices } from '../../services/ServicesContext'
import type { OrgRef } from '../inventory/types'
import DateTimeFields from './DateTimeFields'
import { combine, fromDate, nextSlot, type DateTime } from './slots'
import { formatDateTime } from './timeline'
import type { HospitalRequest } from './types'
import { validLink } from './validate'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

function MeetingDialog({ initial, onSave, onClose }: { initial?: { at: Date; link: string }; onSave: (m: { at: Date; link: string }) => Promise<void>; onClose: () => void }) {
  const linkId = useId()
  const [when, setWhen] = useState<DateTime>(() => (initial ? fromDate(initial.at) : nextSlot(new Date())))
  const [link, setLink] = useState(initial?.link ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const at = combine(when)
    const l = link.trim()
    if (!validLink(l)) return setError('الرابط لازم يبدأ بـ https://')
    if (!at) return setError('اختر اليوم والساعة')
    setBusy(true)
    setError(null)
    try { await onSave({ at, link: l }); onClose() } catch { setError('ما قدرنا نحفظ، حاول مرة ثانية'); setBusy(false) }
  }
  return (
    <Dialog title="اقترح اجتماع" sub="موعد ورابط اجتماع اونلاين يشوفه الطرفين" icon={<Video className="size-5" />} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>احفظ</Button></>}>
      <DateTimeFields dateLabel="يوم الاجتماع" value={when} onChange={setWhen} />
      <div>
        <label htmlFor={linkId} className="mb-1.5 block text-sm font-medium">رابط الاجتماع</label>
        <Input id={linkId} dir="ltr" inputMode="url" autoComplete="off" placeholder="https://meet.google.com/…" maxLength={300} value={link}
          onChange={e => setLink(e.target.value)} invalid={!!error} aria-describedby={error ? `${linkId}-err` : undefined} />
        {error && <span id={`${linkId}-err`} role="alert" className="mt-1 block text-xs text-urgent">{error}</span>}
      </div>
    </Dialog>
  )
}

/** Optional meeting (statuses 2–5): either side proposes, replaces or removes it. */
export default function MeetingCard({ request: r, me }: { request: HospitalRequest; me: OrgRef }) {
  const { requests } = useServices()
  const [editing, setEditing] = useState(false)
  const [failed, setFailed] = useState(false)
  if (r.status < 2 || r.status > 5) return null
  const m = r.meeting
  const remove = async () => {
    setFailed(false)
    try { await requests.setMeeting(me, r.id, null) } catch { setFailed(true) }
  }
  return (
    <section className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-status-2/10 text-status-2" aria-hidden><Video className="size-5" /></span>
        <div className="min-w-48 flex-1">
          <h2 className="font-bold">{m ? 'اجتماع مقترح' : 'اجتماع (اختياري)'}</h2>
          <p className="text-xs text-muted">
            {m ? <><span className="tabular-nums">{formatDateTime(m.at)}</span> · اقترحته {m.byName}</> : 'اتفقوا على موعد ورابط اجتماع اونلاين لو تحتاجون'}
          </p>
        </div>
        {m ? (
          <div className="flex items-center gap-2">
            {validLink(m.link) && <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-control bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line hover:bg-surface">افتح الرابط</a>}
            <button type="button" aria-label="غيّر الاجتماع" onClick={() => setEditing(true)} className="grid size-10 place-items-center rounded-control text-muted hover:bg-surface"><Pencil className="size-4" /></button>
            <button type="button" aria-label="احذف الاجتماع" onClick={remove} className="grid size-10 place-items-center rounded-control text-urgent hover:bg-urgent/5"><Trash2 className="size-4" /></button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)}>اقترح اجتماع</Button>
        )}
      </div>
      {failed && <p role="alert" className="mt-3 text-sm text-urgent">ما قدرنا نحفظ، حاول مرة ثانية</p>}
      {editing && <MeetingDialog initial={m} onClose={() => setEditing(false)} onSave={x => requests.setMeeting(me, r.id, x)} />}
    </section>
  )
}
