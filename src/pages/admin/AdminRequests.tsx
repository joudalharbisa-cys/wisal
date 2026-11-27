import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Search, X } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import { AdminStatus, Marker, type Attention } from '../../features/admin/AdminStatus'
import { CARD } from '../../features/admin/card'
import { isLate, isLocked, stageOf, STAGES, uncovered, type Stage } from '../../features/admin/stages'
import { approvedCharities, routeLine, useAdminData } from '../../features/admin/useAdminData'
import { PRIORITY_LABEL, type Priority } from '../../lib/labels'
import { formatDateTime, latestStep } from '../../features/requests/timeline'
import AppShell from '../../layout/AppShell'

const ATTENTION_LABEL: Record<Attention, string> = { late: 'متأخرة', locked: 'الرمز مقفول', uncovered: 'ما فيه جمعية تغطيها' }

/** Every request, newest activity first; filters live in the URL so the overview can link to them. */
export default function AdminRequests() {
  const { orgs, requests, stock, failed } = useAdminData()
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const stage = params.get('stage') as Stage | null
  const attention = params.get('attention') as Attention | null
  const hospital = params.get('hospital') ?? ''
  const charity = params.get('charity') ?? ''
  const priority = (params.get('priority') ?? '') as Priority | ''
  const q = params.get('q') ?? ''
  const set = (k: string, v: string | null) => setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })

  if (failed) return <AppShell title="الطلبات"><Alert tone="danger">تعذّر تحميل البيانات، حاول مرة ثانية</Alert></AppShell>
  if (!orgs || !requests || !stock) return <AppShell title="الطلبات"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>

  const approved = approvedCharities(orgs)
  const marks = (r: (typeof requests)[number]) => {
    const m: Attention[] = []
    if (isLate(r, now)) m.push('late')
    if (isLocked(r)) m.push('locked')
    if (uncovered(r, stock, approved)) m.push('uncovered')
    return m
  }
  const rest = requests.filter(r =>
    (!hospital || r.hospitalId === hospital) && (!charity || r.charityId === charity) && (!priority || r.priority === priority)
    && (!q.trim() || r.itemName.includes(q.trim())) && (!attention || marks(r).includes(attention)))
  const shown = stage ? rest.filter(r => stageOf(r) === stage) : rest
  const hospitals = orgs.filter(o => o.role === 'hospital' && o.status === 'approved')
  const charities = orgs.filter(o => o.role === 'charity' && o.status === 'approved')
  const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-sm transition ${on ? 'bg-primary font-medium text-white' : 'bg-white text-muted ring-1 ring-inset ring-line hover:text-ink'}`

  return (
    <AppShell title="الطلبات" sub="كل طلب ووين وصل">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={!stage} onClick={() => set('stage', null)} className={chip(!stage)}>الكل {rest.length}</button>
          {STAGES.map(s => (
            <button key={s.key} type="button" aria-pressed={stage === s.key} onClick={() => set('stage', s.key)} className={chip(stage === s.key)}>
              {s.label} {rest.filter(r => stageOf(r) === s.key).length}
            </button>
          ))}
          {attention && (
            <button type="button" onClick={() => set('attention', null)} className="inline-flex items-center gap-1 rounded-full bg-[#FEECEC] px-3 py-1.5 text-sm font-medium text-urgent">
              {ATTENTION_LABEL[attention]} <X className="size-3.5" aria-label="شيل الفلتر" />
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select aria-label="المستشفى" value={hospital} onChange={e => set('hospital', e.target.value)}><option value="">كل المستشفيات</option>{hospitals.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          <Select aria-label="الجمعية" value={charity} onChange={e => set('charity', e.target.value)}><option value="">كل الجمعيات</option>{charities.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          <Select aria-label="الأولوية" value={priority} onChange={e => set('priority', e.target.value)}><option value="">كل الأولويات</option>{(Object.keys(PRIORITY_LABEL) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select>
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input type="search" aria-label="ابحث بالمنتج" placeholder="ابحث بالمنتج" value={q} onChange={e => set('q', e.target.value)} className="ps-9" /></div>
        </div>
        <section className={CARD}>
          {shown.length === 0 ? <p className="p-10 text-center text-muted">ما فيه طلبات بهالفلتر</p> : (
            <ul aria-label="الطلبات" className="divide-y divide-line">
              {shown.map(r => {
                const last = latestStep(r, 'admin')
                return (
                  <li key={r.id}>
                    <Link to={`/admin/requests/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:bg-surface">
                      <div className="min-w-56 flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-bold">{r.itemName} · <span className="tabular-nums">{r.qty}</span> <PriorityBadge priority={r.priority} />{marks(r).map(m => <Marker key={m} kind={m} />)}</div>
                        <div className="mt-1 text-xs text-muted">{routeLine(r)}</div>
                        {last?.at && <div className="mt-0.5 text-xs text-muted">{last.label} · <span className="tabular-nums">{formatDateTime(last.at)}</span></div>}
                      </div>
                      <AdminStatus r={r} />
                      <ChevronLeft className="size-5 text-muted" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
