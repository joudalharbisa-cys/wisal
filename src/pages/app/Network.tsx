import { useEffect, useId, useState } from 'react'
import { Building2, HandHeart, MapPin, Search } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { ConditionBadge, RoleBadge } from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import Table from '../../components/ui/Table'
import { normalizeName } from '../../features/inventory/names'
import type { StockRow } from '../../features/inventory/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const available = (r: StockRow) => r.qty - r.reserved

function OrgCard({ rows, me }: { rows: StockRow[]; me: boolean }) {
  const titleId = useId()
  const { orgName, orgRole } = rows[0]
  const Icon = orgRole === 'hospital' ? Building2 : HandHeart
  const cities = [...new Set(rows.map(r => r.city))].join('، ')
  const sorted = [...rows].sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, 'ar') || a.itemName.localeCompare(b.itemName, 'ar'))
  return (
    <section aria-labelledby={titleId} className={`rounded-card border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] ${me ? 'border-primary/40 ring-1 ring-primary/20' : 'border-line'}`}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${orgRole === 'hospital' ? 'bg-hospital/10 text-hospital' : 'bg-charity/10 text-charity'}`}><Icon className="size-5" /></span>
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 font-bold">
            {orgName}
            {me && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-white">أنت</span>}
          </h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5" />{cities}</p>
        </div>
        <div className="ms-auto"><RoleBadge role={orgRole} /></div>
      </div>
      <Table
        columns={['المستودع', 'المنتج', 'الحالة', 'المتاح']}
        rows={sorted.map(r => [
          <span className="text-muted">{r.warehouseName}</span>,
          <span className="font-medium">{r.itemName}</span>,
          <ConditionBadge condition={r.condition} />,
          <span className="font-bold tabular-nums">{available(r)}</span>,
        ])}
      />
    </section>
  )
}

/** Every approved org's available stock (option C), searchable by product. Read-only. */
export default function Network() {
  const session = useCurrentSession()
  const { inventory } = useServices()
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const myId = session.kind === 'member' ? session.user.uid : null

  useEffect(() => inventory.watchAllStock(r => { setRows(r); setFailed(false) }, () => setFailed(true)), [inventory])

  const needle = normalizeName(q)
  const visible = (rows ?? []).filter(r => available(r) > 0 && (!needle || normalizeName(r.itemName).includes(needle)))
  const groups = new Map<string, StockRow[]>()
  for (const r of visible) groups.set(r.orgId, [...(groups.get(r.orgId) ?? []), r])
  const ordered = [...groups.entries()].sort(([a, ra], [b, rb]) => (a === myId ? -1 : b === myId ? 1 : ra[0].orgName.localeCompare(rb[0].orgName, 'ar')))
  const total = visible.reduce((n, r) => n + available(r), 0)

  return (
    <AppShell title="مخزون الجهات" sub="مخزون كل المستشفيات والجمعيات المقبولة في وصال">
      <div className="space-y-6">
        <section className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input type="search" aria-label="ابحث بالمنتج" placeholder="ابحث بالمنتج" value={q} onChange={e => setQ(e.target.value)} className="ps-9" />
          </div>
          {rows && !failed && (
            <p className="text-sm text-muted"><b className="text-ink tabular-nums">{total}</b> قطعة متاحة عند <b className="text-ink tabular-nums">{groups.size}</b> جهات</p>
          )}
        </section>

        {failed ? (
          <Alert tone="danger">تعذّر تحميل المخزون</Alert>
        ) : rows === null ? (
          <div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div>
        ) : ordered.length === 0 ? (
          <p className="rounded-card bg-white p-10 text-center text-muted">{needle ? 'ما فيه مخزون يطابق بحثك' : 'ما فيه مخزون متاح للحين'}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {ordered.map(([orgId, list]) => <OrgCard key={orgId} rows={list} me={orgId === myId} />)}
          </div>
        )}
      </div>
    </AppShell>
  )
}
