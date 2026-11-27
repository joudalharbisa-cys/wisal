import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, CircleAlert, HandHeart, RotateCcw, Send, KeyRound, MapPin, PackageCheck, Phone, UserRound, Users } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { hospitalStatus, STATUS_SHORT, type RequestStatus } from '../../lib/labels'
import { longDate, RequestStatusBadge } from '../../features/requests/RequestStatus'
import { ACCEPT_LABEL, type Contact, type HospitalRequest, type Ranked, type Rejection } from '../../features/requests/types'
import { rankCharities } from '../../features/requests/rank'
import RankingList from '../../features/requests/RankingList'
import HospitalDelivery, { CodeLockNotice } from '../../features/requests/HospitalDelivery'
import MeetingCard from '../../features/requests/MeetingCard'
import AdminNoteCard from '../../features/requests/AdminNoteCard'
import Timeline from '../../features/requests/RequestTimeline'
import Button from '../../components/ui/Button'
import { useCurrentSession } from '../../session/Guard'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-muted" aria-hidden>{icon}</span>
      <div><div className="text-xs text-muted">{label}</div><div className="mt-0.5 font-medium">{children}</div></div>
    </div>
  )
}

/** One request: status steps, all fields, and the receipt code (hospital only). */
export default function RequestDetails() {
  const { id = '' } = useParams()
  const { requests } = useServices()
  const [r, setR] = useState<HospitalRequest | null | undefined>(undefined)
  const [code, setCode] = useState<string | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [pastRejection, setPastRejection] = useState<Rejection | null>(null)
  const [failed, setFailed] = useState(false)
  const [ranked, setRanked] = useState<Ranked[] | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionFailed, setActionFailed] = useState<string | null>(null)
  const session = useCurrentSession()
  const hospital = session.kind === 'member' && session.org ? { uid: session.user.uid, name: session.org.name, role: session.org.role } : null

  useEffect(() => requests.watchOne(id, setR, () => setFailed(true)), [requests, id])
  useEffect(() => requests.watchContact(id, setContact), [requests, id])
  useEffect(() => requests.watchRejection(id, setPastRejection), [requests, id])
  // The code is readable once the request is out for delivery / ready for pickup; start listening when it gets there.
  const codeVisible = !!r && r.status >= 4
  useEffect(() => (codeVisible ? requests.watchCode(id, setCode, () => setFailed(true)) : undefined), [requests, id, codeVisible])

  if (failed) return <AppShell title="تفاصيل الطلب"><Alert tone="danger">تعذّر تحميل الطلب، حاول مرة ثانية</Alert></AppShell>
  if (r === undefined) return <AppShell title="تفاصيل الطلب"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>
  if (r === null) {
    return (
      <AppShell title="تفاصيل الطلب">
        <section className={`${CARD} p-10 text-center`}>
          <p className="font-bold">ما لقينا هذا الطلب</p>
          <Link to="/app" className="mt-4 inline-block text-sm font-medium text-primary underline">رجوع لطلباتي</Link>
        </section>
      </AppShell>
    )
  }

  const place = [`${r.delivery.city}، ${r.delivery.district}`, r.delivery.details].filter(Boolean).join(' · ')
  const waiting = r.status === 0 && !r.open && !!hospital && r.hospitalId === hospital.uid

  const chooseAgain = async () => {
    setBusy(true)
    setActionFailed(null)
    try {
      const c = await requests.loadCandidates(r.itemId)
      setRanked(rankCharities({ itemId: r.itemId, qty: r.qty, accept: r.accept, priority: r.priority, delivery: r.delivery }, c))
      setChosen(null)
    } catch {
      setActionFailed('تعذّر تحميل الجمعيات، حاول مرة ثانية')
    } finally {
      setBusy(false)
    }
  }
  const act = async (run: () => Promise<void>) => {
    setBusy(true)
    setActionFailed(null)
    try { await run(); setRanked(null) } catch { setActionFailed('ما قدرنا نحفظ، حاول مرة ثانية') } finally { setBusy(false) }
  }

  if (ranked && hospital) {
    const pick = ranked.find(x => x.charity.id === chosen) ?? null
    return (
      <AppShell title="اختر جمعية ثانية" sub={`${r.itemName} · ${r.qty}`}>
        <div className="space-y-6">
          <Button variant="outline" onClick={() => setRanked(null)}><ArrowRight className="size-4" /> رجوع للطلب</Button>
          {ranked.length === 0
            ? <section className={`${CARD} p-10 text-center`}><h2 className="text-lg font-bold">ما فيه جمعية عندها الكمية للحين</h2></section>
            : <RankingList ranked={ranked} chosen={chosen} onChoose={setChosen} rejectedBefore={r.excluded} />}
          {pick && (
            <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-primary-dark px-5 py-4 text-white shadow-lg">
              <p className="text-sm">بيوصل الطلب لـ<b>{pick.charity.name}</b> وتنتظر موافقتها</p>
              <Button variant="secondary" className="h-11 px-6" loading={busy}
                onClick={() => act(() => requests.chooseAgain(hospital, r.id, { charityId: pick.charity.id, charityName: pick.charity.name, warehouseId: pick.warehouse.id }))}>
                <Send className="size-4" /> أرسل الطلب لـ{pick.charity.name}
              </Button>
            </div>
          )}
          {actionFailed && <Alert tone="danger">{actionFailed}</Alert>}
        </div>
      </AppShell>
    )
  }
  return (
    <AppShell title={`${r.itemName} · ${r.qty}`} sub={<span className="flex items-center gap-2"><PriorityBadge priority={r.priority} /> أُرسل {longDate(r.createdAt)}</span>}>
      {/* One centred column; the receipt code joins at the bottom once the request is out for delivery / ready for pickup. */}
      <div className="mx-auto max-w-3xl space-y-6">
          {waiting && (r.lastRejection || r.adminReturn) && (
            <section className="flex flex-wrap items-start gap-4 rounded-card border border-medium/30 bg-white p-5 shadow-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-medium/10 text-medium" aria-hidden><CircleAlert className="size-5" /></span>
              <div className="min-w-56 flex-1">
                <h2 className="font-bold">{r.lastRejection ? `رفضت ${r.lastRejection.charityName} الطلب` : `أرجعت إدارة وصال الطلب من ${r.adminReturn!.charityName}`}</h2>
                {(r.lastRejection ?? r.adminReturn)!.reason && <p className="mt-1 text-sm text-muted">السبب: {(r.lastRejection ?? r.adminReturn)!.reason}</p>}
                <p className="mt-1 text-xs text-muted">ما يوصل الطلب لأي جمعية لين تختار جمعية ثانية او تنشره كطلب مفتوح.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-11 px-4" disabled={busy} onClick={() => hospital && act(() => requests.publishOpen(hospital, r.id))}>انشره كطلب مفتوح</Button>
                <Button variant="secondary" className="h-11 px-5" loading={busy} onClick={chooseAgain}><RotateCcw className="size-4" /> اختر جمعية ثانية</Button>
              </div>
              {actionFailed && <div className="w-full"><Alert tone="danger">{actionFailed}</Alert></div>}
            </section>
          )}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center justify-between"><h2 className="font-bold">حالة الطلب</h2><RequestStatusBadge status={r.status} open={r.open} mode={r.mode} hospital /></div>
            {r.status === 0 && r.open && <p className="mt-2 text-sm text-muted">طلب مفتوح، أي جمعية عندها الكمية تقدر تقبله.</p>}
            <ol className="mt-6 grid grid-cols-6 gap-1">
              {([0, 1, 2, 3, 4, 5] as RequestStatus[]).map(i => (
                <li key={i} className="text-center" aria-current={i === hospitalStatus(r.status) ? 'step' : undefined}>
                  <span className={`block h-1.5 rounded-full ${i <= hospitalStatus(r.status) ? 'bg-primary' : 'bg-line'}`} />
                  <span className={`mt-2 block text-[11px] ${i === hospitalStatus(r.status) ? 'font-bold text-primary' : 'text-muted'}`}>{STATUS_SHORT[i]}</span>
                </li>
              ))}
            </ol>
          </section>
          <AdminNoteCard note={r.adminNote} />
          {hospital && <CodeLockNotice r={r} me={hospital} />}
          <section className={`${CARD} p-6`}>
            <h2 className="mb-5 font-bold">سجل الطلب</h2>
            <Timeline request={r.lastRejection || !pastRejection ? r : { ...r, lastRejection: pastRejection }} viewer="hospital" />
          </section>
          {hospital && <HospitalDelivery r={r} me={hospital} />}
          {hospital && <MeetingCard request={r} me={hospital} />}
          <section className={`${CARD} grid gap-x-8 px-6 py-3 sm:grid-cols-2`}>
            <Row icon={<HandHeart className="size-4" />} label="الجمعية">{r.charityName ?? 'طلب مفتوح، ما انرسل لجمعية للحين'}</Row>
            <Row icon={<Users className="size-4" />} label="عدد المستفيدين"><span className="tabular-nums">{r.beneficiaries}</span></Row>
            <Row icon={<CalendarDays className="size-4" />} label="آخر موعد">{longDate(r.neededBy)}</Row>
            <Row icon={<PackageCheck className="size-4" />} label="الحالة المقبولة">{ACCEPT_LABEL[r.accept]}</Row>
            <Row icon={<UserRound className="size-4" />} label="المستلم">{(contact ?? r.legacyReceiver)?.name ?? '—'}</Row>
            <Row icon={<Phone className="size-4" />} label="الجوال"><span dir="ltr" className="tabular-nums">{(contact ?? r.legacyReceiver)?.phone ?? '—'}</span></Row>
            <Row icon={<MapPin className="size-4" />} label="مكان التسليم">{place}</Row>
          </section>
          {(r.status === 4 || r.status === 5) && (
            <section className={`${CARD} p-6 text-center`}>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-light text-accent"><KeyRound className="size-6" /></span>
              <h2 className="mt-3 font-bold">رمز الاستلام</h2>
              <div dir="ltr" aria-label="رمز الاستلام" className="mx-auto mt-4 w-fit rounded-card border-2 border-dashed border-accent/50 bg-accent-light px-6 py-3 text-4xl font-bold tracking-[0.4em] tabular-nums">{code ?? '····'}</div>
              <p className="mt-3 text-xs text-muted">{r.mode === 'pickup' ? 'اعطِ الرمز لمندوبك قبل ما يروح، والجمعية تكتبه لما يستلم.' : 'اعطِه للمندوب عند الاستلام بس. الجمعية ما تشوف هذا الرمز.'}</p>
            </section>
          )}
      </div>
    </AppShell>
  )
}
