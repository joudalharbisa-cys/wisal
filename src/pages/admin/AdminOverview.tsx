import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronLeft, ClipboardList, HandHeart, Hourglass } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import Stat from '../../components/ui/Stat'
import { eventSteps } from '../../features/admin/adminTimeline'
import { Marker, type Attention } from '../../features/admin/AdminStatus'
import { CARD } from '../../features/admin/card'
import { isLate, isLocked, stageOf, STAGES, uncovered } from '../../features/admin/stages'
import { useAdminData } from '../../features/admin/useAdminData'
import type { RequestEvent } from '../../features/requests/events'
import { formatDateTime } from '../../features/requests/timeline'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'

const DOT = ['bg-status-0', 'bg-medium', 'bg-status-1', 'bg-status-2', 'bg-status-3', 'bg-status-4', 'bg-status-5', 'bg-status-6']

const ATTENTION_TEXT: Record<Attention, (n: number) => string> = {
  late: n => (n === 1 ? 'طلب واحد عدى آخر موعده وما وصل' : `${n} طلبات عدى آخر موعدها وما وصلت`),
  locked: n => (n === 1 ? 'طلب واحد انقفل فيه إدخال الرمز' : `${n} طلبات انقفل فيها إدخال الرمز`),
  uncovered: n => (n === 1 ? 'طلب مفتوح ما عند أي جمعية كميته' : `${n} طلبات مفتوحة ما عند أي جمعية كميتها`),
}

/** A feed line: like the log, but a code attempt alone can't tell yet whether it was right. */
const feedLabel = (e: RequestEvent) => (e.type === 'codeAttempt' ? `محاولة إدخال الرمز (${e.count ?? '?'} من 5)` : eventSteps([e])[0].label)

/** Admin home: numbers, stages, what needs attention, and the latest activity. */
export default function AdminOverview() {
  const { admin } = useServices()
  const { orgs, requests, stock, failed } = useAdminData()
  const [recent, setRecent] = useState<RequestEvent[]>([])
  const [now] = useState(() => new Date())
  useEffect(() => admin.watchRecentEvents(10, setRecent), [admin])

  if (failed) return <AppShell title="نظرة عامة"><Alert tone="danger">تعذّر تحميل البيانات، حاول مرة ثانية</Alert></AppShell>
  if (!orgs || !requests || !stock) return <AppShell title="نظرة عامة"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>

  const approved = (role: string) => orgs.filter(o => o.role === role && o.status === 'approved').length
  const counts = new Map(STAGES.map(s => [s.key, requests.filter(r => stageOf(r) === s.key).length]))
  const attention: [Attention, number][] = [
    ['late', requests.filter(r => isLate(r, now)).length],
    ['locked', requests.filter(isLocked).length],
    ['uncovered', requests.filter(r => uncovered(r, stock)).length],
  ]
  const byId = new Map(requests.map(r => [r.id, r]))

  return (
    <AppShell title="نظرة عامة" sub="كل شي في وصال، لحظة بلحظة">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="مستشفيات معتمدة" value={approved('hospital')} icon={<Building2 className="size-5" />} />
          <Stat label="جمعيات معتمدة" value={approved('charity')} icon={<HandHeart className="size-5" />} />
          <Link to="/admin/applications" className="block"><Stat label="طلبات تسجيل تنتظر" value={orgs.filter(o => o.status === 'pending').length} icon={<Hourglass className="size-5" />} /></Link>
          <Stat label="كل الطلبات" value={requests.length} icon={<ClipboardList className="size-5" />} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-6">
            <section aria-label="الطلبات حسب المرحلة" className={`${CARD} p-6`}>
              <h2 className="mb-4 font-bold">الطلبات حسب المرحلة</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STAGES.map((s, i) => (
                  <Link key={s.key} to={`/admin/requests?stage=${s.key}`} className="rounded-control border border-line p-3 transition hover:bg-surface">
                    <div className="text-2xl font-bold tabular-nums">{counts.get(s.key)}</div>
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-muted"><span className={`mt-1 size-2 shrink-0 rounded-full ${DOT[i]}`} aria-hidden />{s.label}</div>
                  </Link>
                ))}
              </div>
            </section>
            <section aria-label="تحتاج انتباه" className={`${CARD} p-6`}>
              <h2 className="mb-2 font-bold">تحتاج انتباه</h2>
              {attention.every(([, n]) => n === 0) ? (
                <p className="py-3 text-sm text-muted">ما فيه شي يحتاج انتباه الحين.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {attention.filter(([, n]) => n > 0).map(([k, n]) => (
                    <li key={k}>
                      <Link to={`/admin/requests?attention=${k}`} className="flex items-center gap-3 py-3 hover:text-primary">
                        <Marker kind={k} /><span className="flex-1">{ATTENTION_TEXT[k](n)}</span><ChevronLeft className="size-4 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <section aria-label="آخر النشاط" className={`${CARD} h-fit p-6`}>
            <h2 className="mb-4 font-bold">آخر النشاط</h2>
            {recent.length === 0 ? <p className="text-sm text-muted">ما فيه نشاط مسجّل للحين.</p> : (
              <ul className="space-y-4">
                {recent.map(e => {
                  const r = byId.get(e.requestId)
                  return (
                    <li key={`${e.requestId}-${e.n}`} className="text-sm">
                      <Link to={`/admin/requests/${e.requestId}`} className="block hover:text-primary">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3"><b>{feedLabel(e)}</b><span className="text-xs text-muted tabular-nums">{formatDateTime(e.at)}</span></div>
                        {r && <div className="mt-0.5 text-xs text-muted">{r.itemName} · {r.qty} — {r.hospitalName}</div>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
