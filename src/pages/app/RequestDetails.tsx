import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarDays, HandHeart, KeyRound, MapPin, PackageCheck, Phone, UserRound, Users } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { STATUS_SHORT, type RequestStatus } from '../../lib/labels'
import { longDate, RequestStatusBadge } from '../../features/requests/RequestStatus'
import { ACCEPT_LABEL, type HospitalRequest } from '../../features/requests/types'
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
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const stops = [requests.watchOne(id, setR, () => setFailed(true)), requests.watchCode(id, setCode, () => setFailed(true))]
    return () => stops.forEach(s => s())
  }, [requests, id])

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
  return (
    <AppShell title={`${r.itemName} · ${r.qty}`} sub={<span className="flex items-center gap-2"><PriorityBadge priority={r.priority} /> أُرسل {longDate(r.createdAt)}</span>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <section className={`${CARD} p-6`}>
            <div className="flex items-center justify-between"><h2 className="font-bold">حالة الطلب</h2><RequestStatusBadge status={r.status} /></div>
            <ol className="mt-6 grid grid-cols-6 gap-1">
              {([0, 1, 2, 3, 4, 5] as RequestStatus[]).map(i => (
                <li key={i} className="text-center" aria-current={i === r.status ? 'step' : undefined}>
                  <span className={`block h-1.5 rounded-full ${i <= r.status ? 'bg-primary' : 'bg-line'}`} />
                  <span className={`mt-2 block text-[11px] ${i === r.status ? 'font-bold text-primary' : 'text-muted'}`}>{STATUS_SHORT[i]}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className={`${CARD} grid gap-x-8 px-6 py-3 sm:grid-cols-2`}>
            <Row icon={<HandHeart className="size-4" />} label="الجمعية">{r.charityName ?? 'طلب مفتوح، ما انرسل لجمعية للحين'}</Row>
            <Row icon={<Users className="size-4" />} label="عدد المستفيدين"><span className="tabular-nums">{r.beneficiaries}</span></Row>
            <Row icon={<CalendarDays className="size-4" />} label="آخر موعد">{longDate(r.neededBy)}</Row>
            <Row icon={<PackageCheck className="size-4" />} label="الحالة المقبولة">{ACCEPT_LABEL[r.accept]}</Row>
            <Row icon={<UserRound className="size-4" />} label="المستلم">{r.receiver.name}</Row>
            <Row icon={<Phone className="size-4" />} label="الجوال"><span dir="ltr" className="tabular-nums">{r.receiver.phone}</span></Row>
            <Row icon={<MapPin className="size-4" />} label="مكان التسليم">{place}</Row>
          </section>
        </div>
        <section className={`${CARD} h-fit p-6 text-center`}>
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-light text-accent"><KeyRound className="size-6" /></span>
          <h2 className="mt-3 font-bold">رمز الاستلام</h2>
          <div dir="ltr" aria-label="رمز الاستلام" className="mx-auto mt-4 w-fit rounded-card border-2 border-dashed border-accent/50 bg-accent-light px-6 py-3 text-4xl font-bold tracking-[0.4em] tabular-nums">{code ?? '····'}</div>
          <p className="mt-3 text-xs text-muted">اعطِه للمندوب عند الاستلام بس. الجمعية ما تشوف هذا الرمز.</p>
        </section>
      </div>
    </AppShell>
  )
}
