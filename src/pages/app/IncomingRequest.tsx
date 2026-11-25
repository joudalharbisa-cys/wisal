import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Check, CheckCircle2, MapPin, PackageCheck, Phone, UserRound, Users, Warehouse as WarehouseIcon, X } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Dialog from '../../components/ui/Dialog'
import Field from '../../components/ui/Field'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import type { StockRow, Warehouse } from '../../features/inventory/types'
import { formatKm, haversineKm } from '../../features/requests/rank'
import { longDate, RequestStatusBadge } from '../../features/requests/RequestStatus'
import { availableIn } from '../../features/requests/reserve'
import { ACCEPT_LABEL, type Contact, type HospitalRequest } from '../../features/requests/types'
import AppShell from '../../layout/AppShell'
import { ServiceError } from '../../services/types'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-muted" aria-hidden>{icon}</span>
      <div><div className="text-xs text-muted">{label}</div><div className="mt-0.5 font-medium">{children}</div></div>
    </div>
  )
}

const failText = (e: unknown) =>
  e instanceof ServiceError && e.message === 'short' ? 'الكمية ما تكفي الحين'
    : e instanceof ServiceError && e.message === 'taken' ? 'أخذته جمعية ثانية'
      : 'ما قدرنا نحفظ، حاول مرة ثانية'

/** A charity's view of one request: details, then accept (reserve stock) or reject. */
export default function IncomingRequest() {
  const { id = '' } = useParams()
  const session = useCurrentSession()
  const { requests, inventory } = useServices()
  const navigate = useNavigate()
  const reasonId = useId()
  const uid = session.kind === 'member' ? session.user.uid : ''
  const org = session.kind === 'member' ? session.org : null

  const [r, setR] = useState<HospitalRequest | null | undefined>(undefined)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<StockRow[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!uid) return
    const stops = [requests.watchOne(id, setR, () => setR(null)), inventory.watchWarehouses(uid, setWarehouses), inventory.watchStock(uid, setRows)]
    return () => stops.forEach(s => s())
  }, [requests, inventory, uid, id])
  const accepted = !!r && r.status >= 2 && r.charityId === uid
  useEffect(() => (accepted ? requests.watchContact(id, setContact) : undefined), [requests, id, accepted])

  if (session.kind !== 'member' || !org) return null
  if (org.role !== 'charity') return <Navigate to="/app" replace />
  if (r === undefined) return <AppShell title="طلب وارد"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>
  if (r === null || (r.charityId !== uid && !(r.status === 0 && r.open))) {
    return (
      <AppShell title="طلب وارد">
        <section className={`${CARD} p-10 text-center`}>
          <p className="font-bold">ما لقينا هذا الطلب</p>
          <Link to="/app" className="mt-4 inline-block text-sm font-medium text-primary underline">رجوع للطلبات الواردة</Link>
        </section>
      </AppShell>
    )
  }

  const sent = r.status === 1 && r.charityId === uid
  const open = r.status === 0 && r.open
  // Own warehouses that cover the whole request; the hospital's choice first, then the nearest.
  const suitable = warehouses
    .map(w => ({ w, available: availableIn(r, w.id, rows), km: haversineKm(r.delivery, w.location) }))
    .filter(x => x.available >= r.qty)
    .sort((a, b) => (a.w.id === r.warehouseId ? -1 : b.w.id === r.warehouseId ? 1 : a.km - b.km))
  const chosen = suitable.find(x => x.w.id === picked) ?? suitable[0]
  const accWh = warehouses.find(w => w.id === r.warehouseId)

  const accept = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try { await requests.accept({ uid, name: org.name, role: org.role }, r.id, chosen.w.id) } catch (e) { setError(failText(e)) } finally { setBusy(false) }
  }
  const reject = async () => {
    setBusy(true)
    setError(null)
    try {
      await requests.reject({ uid, name: org.name, role: org.role }, r.id, reason)
      navigate('/app')
    } catch (e) {
      setError(failText(e))
      setRejecting(false)
      setBusy(false)
    }
  }

  const km = accWh ? haversineKm(r.delivery, accWh.location) : chosen?.km
  return (
    <AppShell title={`${r.itemName} · ${r.qty}`} sub={<span className="flex items-center gap-2"><PriorityBadge priority={r.priority} /> من {r.hospitalName}</span>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className={`${CARD} grid gap-x-8 px-6 py-3 sm:grid-cols-2`}>
          <Row icon={<CalendarDays className="size-4" />} label="يحتاجه قبل">{longDate(r.neededBy)}</Row>
          <Row icon={<Users className="size-4" />} label="عدد المستفيدين"><span className="tabular-nums">{r.beneficiaries}</span></Row>
          <Row icon={<PackageCheck className="size-4" />} label="الحالة المقبولة">{ACCEPT_LABEL[r.accept]}</Row>
          <Row icon={<MapPin className="size-4" />} label="مكان التسليم">
            {[`${r.delivery.city}، ${r.delivery.district}`, r.delivery.details].filter(Boolean).join(' · ')}
            {km !== undefined && <span className="block text-xs font-normal text-muted"><span className="tabular-nums">{formatKm(km)}</span> كم من مستودعك</span>}
          </Row>
          {accepted && <Row icon={<UserRound className="size-4" />} label="المستلم">{contact?.name ?? '—'}</Row>}
          {accepted && <Row icon={<Phone className="size-4" />} label="الجوال"><span dir="ltr" className="tabular-nums">{contact?.phone ?? '—'}</span></Row>}
        </section>

        <section className={`${CARD} h-fit p-6`}>
          <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{accepted ? 'الطلب مقبول' : 'ردك على الطلب'}</h2><RequestStatusBadge status={r.status} /></div>
          {accepted ? (
            <div className="mt-4 flex items-start gap-3 rounded-control bg-normal/10 p-3.5 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-normal" aria-hidden />
              <p>قبلت الطلب، الكمية محجوزة من {accWh?.name ?? 'مستودعك'}<span className="block text-xs text-muted">تواصل مع المستلم لترتيب التسليم.</span></p>
            </div>
          ) : (
            <>
              {chosen ? (
                <>
                  {suitable.length > 1 && (
                    <div className="mt-4">
                      <Field label="المستودع">
                        <Select value={chosen.w.id} onChange={e => setPicked(e.target.value)}>
                          {suitable.map(x => <option key={x.w.id} value={x.w.id}>{x.w.name} · متاح {x.available}</option>)}
                        </Select>
                      </Field>
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-3 rounded-control bg-primary-light/60 p-3.5 text-sm text-primary-dark">
                    <WarehouseIcon className="size-5 shrink-0" aria-hidden />
                    <p>بنحجز <b className="tabular-nums">{r.qty}</b> من <b>{chosen.w.name}</b><span className="block text-xs">المتاح فيه الحين <span className="tabular-nums">{chosen.available}</span></span></p>
                  </div>
                </>
              ) : (
                <div className="mt-4"><Alert tone="warning">الكمية ما تكفي في مستودعاتك الحين</Alert></div>
              )}
              <p className="mt-3 text-xs text-muted">بعد القبول تظهر لك بيانات المستلم، والمستشفى يشوف رمز الاستلام.</p>
              {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
              {sent && (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button variant="danger" className="h-11" disabled={busy} onClick={() => setRejecting(true)}><X className="size-4" /> رفض</Button>
                  <Button variant="secondary" className="h-11" disabled={!chosen} loading={busy} onClick={accept}><Check className="size-4" /> قبول</Button>
                </div>
              )}
              {open && <Button variant="secondary" className="mt-5 h-11 w-full" disabled={!chosen} loading={busy} onClick={accept}><Check className="size-4" /> أقبل الطلب</Button>}
            </>
          )}
        </section>
      </div>

      {rejecting && (
        <Dialog title="رفض الطلب" sub={`${r.itemName} · ${r.qty} من ${r.hospitalName}`} icon={<X className="size-5" />} onClose={() => setRejecting(false)}
          footer={<>
            <Button variant="outline" onClick={() => setRejecting(false)}>إلغاء</Button>
            <Button variant="danger" loading={busy} onClick={reject}>رفض الطلب</Button>
          </>}>
          <p className="text-sm">الطلب بيرجع للمستشفى عشان يختار جمعية ثانية او ينشره كطلب مفتوح.</p>
          <div>
            <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium">السبب (اختياري)</label>
            <textarea id={reasonId} maxLength={200} value={reason} onChange={e => setReason(e.target.value)} className="h-24 w-full rounded-control border border-line p-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-light" />
          </div>
        </Dialog>
      )}
    </AppShell>
  )
}
