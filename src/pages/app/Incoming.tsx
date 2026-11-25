import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarDays, ChevronLeft, MapPin } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import type { StockRow, Warehouse } from '../../features/inventory/types'
import { formatKm, haversineKm } from '../../features/requests/rank'
import { RequestStatusBadge, shortDate } from '../../features/requests/RequestStatus'
import { bestWarehouse } from '../../features/requests/reserve'
import type { HospitalRequest } from '../../features/requests/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'
type Tab = 'mine' | 'open' | 'accepted'
const EMPTY: Record<Tab, string> = { mine: 'ما فيه طلبات تنتظر ردك', open: 'ما فيه طلبات مفتوحة تقدر تغطيها', accepted: 'ما قبلت طلبات للحين' }

function Row({ r, km }: { r: HospitalRequest; km: number | null }) {
  return (
    <li>
      <Link to={`/app/incoming/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 transition hover:bg-surface">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-hospital/10 text-hospital" aria-hidden><Building2 className="size-5" /></span>
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-bold">{r.itemName} · <span className="tabular-nums">{r.qty}</span> <PriorityBadge priority={r.priority} /></div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>{r.hospitalName}</span>
            <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />يحتاجه قبل {shortDate(r.neededBy)}</span>
            {km !== null && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /><span className="tabular-nums">{formatKm(km)}</span> كم من مستودعك</span>}
          </div>
        </div>
        <RequestStatusBadge status={r.status} />
        <ChevronLeft className="size-5 text-muted" aria-hidden />
      </Link>
    </li>
  )
}

/** Charity home: requests sent to it, open requests it can cover, and the ones it accepted. */
export default function Incoming() {
  const session = useCurrentSession()
  const { requests, inventory } = useServices()
  const uid = session.kind === 'member' ? session.user.uid : ''
  const tabsId = useId()
  const [tab, setTab] = useState<Tab>('mine')
  const [mine, setMine] = useState<HospitalRequest[] | null>(null)
  const [open, setOpen] = useState<HospitalRequest[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<StockRow[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!uid) return
    const fail = () => setFailed(true)
    const stops = [
      requests.watchIncoming(uid, setMine, fail), requests.watchOpen(setOpen, fail),
      inventory.watchWarehouses(uid, setWarehouses, fail), inventory.watchStock(uid, setRows, fail),
    ]
    return () => stops.forEach(s => s())
  }, [requests, inventory, uid])

  const whKm = (r: HospitalRequest) => {
    const w = warehouses.find(x => x.id === r.warehouseId)
    if (w) return haversineKm(r.delivery, w.location)
    const near = warehouses.map(x => haversineKm(r.delivery, x.location)).sort((a, b) => a - b)[0]
    return near ?? null
  }
  const waiting = (mine ?? []).filter(r => r.status === 1)
  const accepted = (mine ?? []).filter(r => r.status >= 2)
  // Open requests this charity can cover from one of its warehouses (same rule as the hospital's ranking).
  const coverable = open.flatMap(r => { const b = bestWarehouse(r, warehouses, rows); return b ? [{ r, km: b.distanceKm }] : [] })

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'mine', label: 'لك', count: waiting.length },
    { key: 'open', label: 'مفتوحة', count: coverable.length },
    { key: 'accepted', label: 'قبلتها' },
  ]
  const shown = tab === 'mine' ? waiting.map(r => ({ r, km: whKm(r) })) : tab === 'open' ? coverable : accepted.map(r => ({ r, km: whKm(r) }))

  return (
    <AppShell title="الطلبات الواردة" sub="طلبات المستشفيات الي تنتظر ردك">
      {failed ? (
        <Alert tone="danger">تعذّر تحميل الطلبات، حاول مرة ثانية</Alert>
      ) : mine === null ? (
        <div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div>
      ) : (
        <div className="space-y-5">
          <div role="tablist" aria-label="الطلبات" className="inline-flex gap-1 rounded-full bg-white p-1 shadow-sm">
            {tabs.map(t => (
              <button key={t.key} type="button" role="tab" id={`${tabsId}-${t.key}`} aria-selected={tab === t.key} aria-controls={`${tabsId}-panel`} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition ${tab === t.key ? 'bg-primary font-medium text-white' : 'text-muted hover:text-ink'}`}>
                {t.label}
                {!!t.count && <span className={`grid size-5 place-items-center rounded-full text-[11px] tabular-nums ${tab === t.key ? 'bg-white/20' : 'bg-surface'}`}>{t.count}</span>}
              </button>
            ))}
          </div>
          <section id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className={CARD}>
            {shown.length === 0 ? (
              <p className="p-10 text-center text-muted">{EMPTY[tab]}</p>
            ) : (
              <ul className="divide-y divide-line">{shown.map(({ r, km }) => <Row key={r.id} r={r} km={km} />)}</ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  )
}
