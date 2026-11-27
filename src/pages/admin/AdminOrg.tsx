import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Warehouse as WarehouseIcon } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { ConditionBadge } from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { AdminStatus, OrgStatusBadge } from '../../features/admin/AdminStatus'
import { CARD } from '../../features/admin/card'
import { routeLine, useAdminData } from '../../features/admin/useAdminData'
import type { StockRow, Warehouse } from '../../features/inventory/types'
import type { OrgWithId } from '../../features/orgs/types'
import { longDate } from '../../features/requests/RequestStatus'
import { formatDateTime, latestStep } from '../../features/requests/timeline'
import type { HospitalRequest } from '../../features/requests/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

function RequestRows({ list, label }: { list: HospitalRequest[]; label: string }) {
  return (
    <section aria-label={label} className={CARD}>
      <h2 className="px-6 pt-5 font-bold">{label}</h2>
      {list.length === 0 ? <p className="px-6 py-5 text-sm text-muted">ما فيه طلبات</p> : (
        <ul className="mt-2 divide-y divide-line">
          {list.map(r => {
            const last = latestStep(r, 'admin')
            return (
              <li key={r.id}>
                <Link to={`/admin/requests/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5 transition hover:bg-surface">
                  <div className="min-w-48 flex-1">
                    <div className="font-bold">{r.itemName} · <span className="tabular-nums">{r.qty}</span></div>
                    <div className="text-xs text-muted">{routeLine(r)}{last?.at && <> · {last.label} <span className="tabular-nums">{formatDateTime(last.at)}</span></>}</div>
                  </div>
                  <AdminStatus r={r} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Profile({ org, me }: { org: OrgWithId; me: string }) {
  const rows: [string, string][] = [
    ['رقم الترخيص', org.licenseNo],
    ...(org.role === 'hospital'
      ? [['نوع المستشفى', org.hospitalType === 'private' ? 'خاص' : 'حكومي'] as [string, string]]
      : [['ساعات العمل', org.workingHours ?? '—'], ['توصّل؟', org.canDeliver ? 'إيه، عندها توصيل' : 'لا، المستشفى يستلم من المستودع']] as [string, string][]),
    ['الإيميل', org.contactEmail ?? '—'],
    ['العقد', org.contract ? `نسخة ${org.contract.version} · وقّعه: ${org.contract.acceptedByName}${org.contract.acceptedAt ? ` · ${longDate(org.contract.acceptedAt)}` : ''}` : '—'],
    ['سجّلت', longDate(org.createdAt)],
  ]
  if (org.reviewedAt) rows.push([org.status === 'rejected' ? 'رفضها' : 'اعتمدها', `${org.reviewedBy === me ? 'أنت' : 'أدمن ثاني'} · ${formatDateTime(org.reviewedAt)}`])
  if (org.rejectReason) rows.push(['سبب الرفض', org.rejectReason])
  return (
    <section className={`${CARD} h-fit p-6 text-sm`}>
      <h2 className="mb-4 font-bold">بيانات الجهة</h2>
      <dl className="space-y-3">
        {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>)}
      </dl>
    </section>
  )
}

/** One organisation: profile, warehouses with stock (quantity, reserved, available), its requests. */
export default function AdminOrg() {
  const { id = '' } = useParams()
  const session = useCurrentSession()
  const me = session.kind === 'admin' ? session.user.uid : ''
  const { inventory } = useServices()
  const { orgs, requests, failed } = useAdminData()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<StockRow[]>([])
  useEffect(() => {
    const stops = [inventory.watchWarehouses(id, setWarehouses), inventory.watchStock(id, setRows)]
    return () => stops.forEach(s => s())
  }, [inventory, id])

  if (failed) return <AppShell title="الجهة"><Alert tone="danger">تعذّر تحميل البيانات، حاول مرة ثانية</Alert></AppShell>
  if (!orgs || !requests) return <AppShell title="الجهة"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>
  const org = orgs.find(o => o.id === id)
  if (!org) return <AppShell title="الجهة"><section className={`${CARD} p-10 text-center`}><p className="font-bold">ما لقينا هذي الجهة</p><Link to="/admin/orgs" className="mt-4 inline-block text-sm text-primary underline">رجوع للجهات</Link></section></AppShell>

  const hospital = org.role === 'hospital'
  const own = requests.filter(r => (hospital ? r.hospitalId : r.charityId) === id)
  const rejected = hospital ? [] : requests.filter(r => r.excluded.includes(id) && r.charityId !== id)

  return (
    <AppShell title={org.name} sub={<span className="flex items-center gap-2"><OrgStatusBadge status={org.status} /> {hospital ? 'مستشفى' : 'جمعية'} · {org.city}، {org.district}</span>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Profile org={org} me={me} />
        <div className="space-y-6">
          {warehouses.map(w => {
            const mine = rows.filter(r => r.warehouseId === w.id).sort((a, b) => a.itemName.localeCompare(b.itemName, 'ar') || a.condition.localeCompare(b.condition))
            return (
              <section key={w.id} className={`${CARD} p-6`}>
                <h2 className="flex items-center gap-2 font-bold"><WarehouseIcon className="size-5 text-muted" aria-hidden />{w.name}</h2>
                <p className="mb-4 text-xs text-muted">{w.city}، {w.district}</p>
                {mine.length === 0 ? <p className="text-sm text-muted">المستودع فاضي</p> : (
                  <table aria-label={w.name} className="w-full text-sm">
                    <thead className="text-xs text-muted"><tr><th className="pb-2 text-start font-medium">المنتج</th><th className="pb-2 text-start font-medium">الحالة</th><th className="pb-2 font-medium">الكمية</th><th className="pb-2 font-medium">محجوز</th><th className="pb-2 font-medium">متاح</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {mine.map(r => (
                        <tr key={r.id}><td className="py-2.5 font-medium">{r.itemName}</td><td><ConditionBadge condition={r.condition} /></td><td className="text-center tabular-nums">{r.qty}</td><td className="text-center tabular-nums">{r.reserved}</td><td className="text-center font-bold tabular-nums">{r.qty - r.reserved}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )
          })}
          {!hospital && warehouses.length === 0 && <section className={`${CARD} p-6 text-sm text-muted`}>ما عندها مستودعات للحين</section>}
          <RequestRows list={own} label="طلباتها" />
          {!hospital && rejected.length > 0 && <RequestRows list={rejected} label="رفضتها" />}
        </div>
      </div>
    </AppShell>
  )
}
