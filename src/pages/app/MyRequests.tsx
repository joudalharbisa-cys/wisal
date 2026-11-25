import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ClipboardList, Hourglass, Plus, Send } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import Stat from '../../components/ui/Stat'
import { RequestProgress, RequestStatusBadge, shortDate } from '../../features/requests/RequestStatus'
import type { HospitalRequest } from '../../features/requests/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

/** Hospital home: its requests, newest first. */
export default function MyRequests() {
  const session = useCurrentSession()
  const { requests } = useServices()
  const navigate = useNavigate()
  const uid = session.kind === 'member' ? session.user.uid : ''
  const [list, setList] = useState<HospitalRequest[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => (uid ? requests.watchMine(uid, setList, () => setFailed(true)) : undefined), [requests, uid])

  const newRequest = <Button variant="secondary" className="h-11 px-5" onClick={() => navigate('/app/requests/new')}><Plus className="size-4" /> طلب جديد</Button>
  return (
    <AppShell title="طلباتي" sub="تابع طلباتك من الإرسال لين الوصول" action={newRequest}>
      {failed ? (
        <Alert tone="danger">تعذّر تحميل الطلبات، حاول مرة ثانية</Alert>
      ) : list === null ? (
        <div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div>
      ) : list.length === 0 ? (
        <section className={`${CARD} p-12 text-center`}>
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary-light text-primary"><ClipboardList className="size-8" /></span>
          <h2 className="mt-5 text-lg font-bold">ما عندك طلبات للحين</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">اطلب المنتج الي تحتاجه، ونطلع لك الجمعيات الي عندها الكمية.</p>
          <Button variant="secondary" className="mt-6 h-11 px-6" onClick={() => navigate('/app/requests/new')}><Plus className="size-4" /> طلب جديد</Button>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="كل الطلبات" value={list.length} icon={<ClipboardList className="size-5" />} />
            <Stat label="بانتظار موافقة" value={list.filter(r => r.status === 1).length} icon={<Send className="size-5" />} />
            <Stat label="طلبات مفتوحة" value={list.filter(r => r.status === 0).length} icon={<Hourglass className="size-5" />} />
          </div>
          <section className={CARD}>
            <ul aria-label="طلباتي" className="divide-y divide-line">
              {list.map(r => (
                <li key={r.id}>
                  <Link to={`/app/requests/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 transition hover:bg-surface">
                    <div className="min-w-44 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-bold">{r.itemName} · <span className="tabular-nums">{r.qty}</span> <PriorityBadge priority={r.priority} /></div>
                      <div className="mt-1 text-xs text-muted">{r.charityName ?? 'ما انرسل لجمعية للحين'} · {shortDate(r.createdAt)}</div>
                    </div>
                    <div className="w-48 space-y-1.5">
                      <RequestStatusBadge status={r.status} />
                      <RequestProgress status={r.status} />
                    </div>
                    <ChevronLeft className="size-5 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  )
}
