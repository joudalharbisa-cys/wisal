import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronLeft, HandHeart, Search } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { CARD } from '../../features/admin/card'
import { OrgStatusBadge } from '../../features/admin/AdminStatus'
import { useAdminData } from '../../features/admin/useAdminData'
import type { OrgStatus, OrgWithId } from '../../features/orgs/types'
import { shortDate } from '../../features/requests/RequestStatus'
import AppShell from '../../layout/AppShell'

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick}
    className={`rounded-full px-3.5 py-1.5 text-sm transition ${on ? 'bg-primary font-medium text-white' : 'bg-white text-muted ring-1 ring-inset ring-line hover:text-ink'}`}>{children}</button>
)

type Role = 'all' | 'hospital' | 'charity'
type St = 'all' | OrgStatus

/** Every hospital and charity, with role/status filters and a name search. */
export default function AdminOrgs() {
  const { orgs, requests, stock, failed } = useAdminData()
  const [role, setRole] = useState<Role>('all')
  const [status, setStatus] = useState<St>('all')
  const [q, setQ] = useState('')

  if (failed) return <AppShell title="الجهات"><Alert tone="danger">تعذّر تحميل البيانات، حاول مرة ثانية</Alert></AppShell>
  if (!orgs || !requests || !stock) return <AppShell title="الجهات"><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>

  const meta = (o: OrgWithId) => {
    if (o.status === 'pending') return `سجّلت ${shortDate(o.createdAt)}`
    if (o.status === 'rejected') return o.rejectReason ? `سبب الرفض: ${o.rejectReason}` : 'مرفوضة'
    const mine = requests.filter(r => (o.role === 'hospital' ? r.hospitalId : r.charityId) === o.id).length
    if (o.role === 'hospital') return `${mine} طلب`
    const products = new Set(stock.filter(r => r.orgId === o.id).map(r => r.itemId)).size
    return `${products} منتج · ${mine} طلب`
  }
  const count = (r: Role) => orgs.filter(o => r === 'all' || o.role === r).length
  const shown = orgs
    .filter(o => (role === 'all' || o.role === role) && (status === 'all' || o.status === status) && o.name.includes(q.trim()))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'ar') : a.role === 'charity' ? -1 : 1))

  return (
    <AppShell title="الجهات" sub="كل المستشفيات والجمعيات في وصال">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip on={role === 'all'} onClick={() => setRole('all')}>الكل {count('all')}</Chip>
          <Chip on={role === 'hospital'} onClick={() => setRole('hospital')}>مستشفيات {count('hospital')}</Chip>
          <Chip on={role === 'charity'} onClick={() => setRole('charity')}>جمعيات {count('charity')}</Chip>
          <span className="mx-2 h-6 w-px bg-white/30" aria-hidden />
          {([['all', 'كل الحالات'], ['approved', 'معتمدة'], ['pending', 'بانتظار المراجعة'], ['rejected', 'مرفوضة']] as [St, string][]).map(([k, l]) => (
            <Chip key={k} on={status === k} onClick={() => setStatus(k)}>{l}</Chip>
          ))}
          <div className="relative ms-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" aria-label="ابحث بالاسم" placeholder="ابحث بالاسم" value={q} onChange={e => setQ(e.target.value)} className="ps-9" />
          </div>
        </div>
        <section className={CARD}>
          {shown.length === 0 ? <p className="p-10 text-center text-muted">ما فيه جهات بهالفلتر</p> : (
            <ul aria-label="الجهات" className="divide-y divide-line">
              {shown.map(o => (
                <li key={o.id}>
                  <Link to={`/admin/orgs/${o.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:bg-surface">
                    <span className={`grid size-10 place-items-center rounded-full ${o.role === 'hospital' ? 'bg-hospital/10 text-hospital' : 'bg-primary-light text-primary'}`} aria-hidden>
                      {o.role === 'hospital' ? <Building2 className="size-5" /> : <HandHeart className="size-5" />}
                    </span>
                    <div className="min-w-48 flex-1">
                      <div className="font-bold">{o.name}</div>
                      <div className="mt-0.5 text-xs text-muted">{o.role === 'hospital' ? 'مستشفى' : 'جمعية'} · {o.city}، {o.district}</div>
                    </div>
                    <div className="text-xs text-muted">{meta(o)}</div>
                    <OrgStatusBadge status={o.status} />
                    <ChevronLeft className="size-5 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
