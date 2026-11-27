import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Building2, CalendarClock, HandHeart, KeyRound, MapPin, PackageCheck, RotateCcw, Truck, Undo2, UserRound, Users, Video } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Dialog from '../../components/ui/Dialog'
import Spinner from '../../components/ui/Spinner'
import { eventSteps } from '../../features/admin/adminTimeline'
import { AdminStatus } from '../../features/admin/AdminStatus'
import { CARD } from '../../features/admin/card'
import { routeLine } from '../../features/admin/useAdminData'
import type { RequestEvent } from '../../features/requests/events'
import { StepList } from '../../features/requests/RequestTimeline'
import { longDate } from '../../features/requests/RequestStatus'
import { buildTimeline, formatDateTime, personLine } from '../../features/requests/timeline'
import { ACCEPT_LABEL, type Contact, type HospitalRequest, type Rejection } from '../../features/requests/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'

const ACTION_FAILED = 'ما قدرنا نحفظ، حاول مرة ثانية'

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="flex items-start gap-3 py-2.5"><span className="mt-0.5 text-muted" aria-hidden>{icon}</span><div><div className="text-xs text-muted">{label}</div><div className="mt-0.5 text-sm font-medium">{children}</div></div></div>
}

function NoteEditor({ r }: { r: HospitalRequest }) {
  const { admin } = useServices()
  const id = useId()
  const [text, setText] = useState(r.adminNote?.text ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (value: string | null) => {
    if (value !== null && (value.trim().length < 2 || value.trim().length > 300)) return setError('الملاحظة من 2 إلى 300 حرف')
    setBusy(true); setError(null)
    try { await admin.setNote(r.id, value); if (value === null) setText('') } catch { setError(ACTION_FAILED) } finally { setBusy(false) }
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">ملاحظة للمستشفى والجمعية</label>
      <textarea id={id} maxLength={300} value={text} onChange={e => setText(e.target.value)} placeholder="مثلًا: تواصلنا مع الجمعية والتوصيل بكرة"
        className="h-20 w-full rounded-control border border-line p-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-light" />
      {error && <p role="alert" className="mt-1 text-xs text-urgent">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" loading={busy} onClick={() => save(text)}>احفظ الملاحظة</Button>
        {r.adminNote && <Button variant="danger" disabled={busy} onClick={() => save(null)}>احذف الملاحظة</Button>}
      </div>
      {r.adminNote && <p className="mt-2 text-xs text-muted">آخر ملاحظة: {formatDateTime(r.adminNote.at)}</p>}
    </div>
  )
}

function Actions({ r }: { r: HospitalRequest }) {
  const { admin } = useServices()
  const reasonId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  const fails = r.codeFails ?? 0
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn(); return true } catch { setError(ACTION_FAILED); return false } finally { setBusy(false) }
  }
  const doReturn = async () => {
    if (reason.trim().length < 3) return setError('اكتب السبب (3 أحرف على الأقل)')
    if (await run(() => admin.returnToHospital(r.id, reason))) { setReturning(false); setReason('') }
  }
  return (
    <section aria-label="إجراءات الإدارة" className={`${CARD} space-y-4 p-6`}>
      <h2 className="font-bold">إجراءات الإدارة</h2>
      {r.status === 5 && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-surface p-3.5">
          <KeyRound className={`size-5 ${fails >= 5 ? 'text-urgent' : 'text-muted'}`} aria-hidden />
          <p className="flex-1 text-sm">{fails >= 5 ? `محاولات الرمز: ${fails} من 5 — الإدخال مقفول` : `محاولات الرمز: ${fails} من 5`}</p>
          {fails >= 1 && <Button variant="outline" loading={busy} onClick={() => run(() => admin.resetCode(r.id))}><RotateCcw className="size-4" /> صفّر محاولات الرمز</Button>}
        </div>
      )}
      {r.status === 1 && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-surface p-3.5">
          <p className="flex-1 text-sm">الجمعية ما ردت؟ أرجع الطلب للمستشفى عشان يختار جمعية ثانية او ينشره.</p>
          <Button variant="outline" disabled={busy} onClick={() => setReturning(true)}><Undo2 className="size-4" /> أرجع الطلب للمستشفى</Button>
        </div>
      )}
      <NoteEditor key={r.adminNote?.at.getTime() ?? 'none'} r={r} />
      {error && !returning && <Alert tone="danger">{error}</Alert>}
      {returning && (
        <Dialog title="أرجع الطلب للمستشفى" sub={`${r.itemName} · ${r.qty} — ${r.charityName ?? ''}`} icon={<Undo2 className="size-5" />} onClose={() => setReturning(false)}
          footer={<><Button variant="outline" onClick={() => setReturning(false)}>إلغاء</Button><Button loading={busy} onClick={doReturn}>أرجعه</Button></>}>
          <p className="text-sm">الطلب يرجع للمستشفى ويشوف السبب، والجمعية ما تنحسب إنها رفضته.</p>
          <div>
            <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium">السبب</label>
            <textarea id={reasonId} maxLength={200} value={reason} onChange={e => setReason(e.target.value)} className="h-24 w-full rounded-control border border-line p-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-light" />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
        </Dialog>
      )}
    </section>
  )
}

/** One request for the admin: everything about it, its full log, and the three admin actions. */
export default function AdminRequest() {
  const { id = '' } = useParams()
  const { requests } = useServices()
  const [r, setR] = useState<HospitalRequest | null | undefined>(undefined)
  const [events, setEvents] = useState<RequestEvent[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [past, setPast] = useState<Rejection | null>(null)
  useEffect(() => {
    const stops = [requests.watchOne(id, setR, () => setR(null)), requests.watchEvents(id, setEvents), requests.watchContact(id, setContact), requests.watchRejection(id, setPast)]
    return () => stops.forEach(s => s())
  }, [requests, id])

  if (r === undefined) return <AppShell title="الطلب"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>
  if (r === null) return <AppShell title="الطلب"><section className={`${CARD} p-10 text-center`}><p className="font-bold">ما لقينا هذا الطلب</p><Link to="/admin/requests" className="mt-4 inline-block text-sm text-primary underline">رجوع للطلبات</Link></section></AppShell>

  const logged = events.length > 0
  const partial = logged && !['sent', 'published'].includes(events[0].type)
  // Steps from the log, then the ones still ahead; without a log, the step dates on the request.
  const ahead = buildTimeline(r, 'admin').filter(s => !s.at)
  const steps = logged ? [...eventSteps(events), ...ahead] : buildTimeline(r.lastRejection || !past ? r : { ...r, lastRejection: past }, 'admin')
  const receiver = contact ?? r.legacyReceiver

  return (
    <AppShell title={`${r.itemName} · ${r.qty}`} sub={<span className="flex items-center gap-2"><PriorityBadge priority={r.priority} /> {routeLine(r)}</span>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <section className={`${CARD} p-6`}>
            <div className="flex items-center justify-between"><h2 className="font-bold">حالة الطلب</h2><AdminStatus r={r} /></div>
            <div className="mt-5 flex gap-1" aria-hidden>{Array.from({ length: 7 }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= r.status ? 'bg-primary' : 'bg-line'}`} />)}</div>
          </section>
          <section className={`${CARD} p-6`}>
            <h2 className="mb-1 font-bold">سجل الطلب الكامل</h2>
            {!logged && <p className="mb-4 text-xs text-muted">هذا الطلب قبل السجل الكامل، المعروض تواريخ مراحله بس.</p>}
            {partial && <p className="mb-4 text-xs text-muted">السجل قبل {formatDateTime(events[0].at)} ناقص.</p>}
            <div className="mt-4"><StepList steps={steps} label="سجل الطلب" /></div>
          </section>
        </div>
        <div className="space-y-6">
          <Actions r={r} />
          <section className={`${CARD} px-6 py-3`}>
            <Fact icon={<Building2 className="size-4" />} label="المستشفى"><Link to={`/admin/orgs/${r.hospitalId}`} className="hover:text-primary">{r.hospitalName}</Link></Fact>
            {r.charityId && <Fact icon={<HandHeart className="size-4" />} label="الجمعية"><Link to={`/admin/orgs/${r.charityId}`} className="hover:text-primary">{r.charityName}</Link>{r.reservation && <span className="block text-xs font-normal text-muted">محجوز: {Object.values(r.reservation).reduce((a, b) => a + b, 0)}</span>}</Fact>}
            <Fact icon={<UserRound className="size-4" />} label="المستلم">{receiver ? <><span>{receiver.name}</span> · <span dir="ltr" className="tabular-nums">{receiver.phone}</span></> : '—'}</Fact>
            <Fact icon={<MapPin className="size-4" />} label="مكان التسليم">{[`${r.delivery.city}، ${r.delivery.district}`, r.delivery.details].filter(Boolean).join(' · ')}</Fact>
            <Fact icon={<CalendarClock className="size-4" />} label="آخر موعد">{longDate(r.neededBy)}</Fact>
            <Fact icon={<Users className="size-4" />} label="المستفيدين">{r.beneficiaries}</Fact>
            <Fact icon={<PackageCheck className="size-4" />} label="الحالة المقبولة">{ACCEPT_LABEL[r.accept]}</Fact>
            {r.mode && <Fact icon={<Truck className="size-4" />} label="التوصيل">{r.mode === 'pickup' ? (r.pickup ? personLine('مندوب المستشفى', r.pickup, 'يجي') : 'استلام من المستودع') : (r.driver ? personLine('السائق', r.driver, 'يوصل تقريبًا') : 'الجمعية توصّل')}</Fact>}
            {r.meeting && <Fact icon={<Video className="size-4" />} label="الاجتماع">{formatDateTime(r.meeting.at)} · اقترحه {r.meeting.byName}</Fact>}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
