import { AlertTriangle, Hourglass, Lock } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import type { OrgStatus } from '../orgs/types'
import type { HospitalRequest } from '../requests/types'

/** Full 7-step badge; «بانتظار قرارك» (the hospital's own wording) reads «بانتظار قرار المستشفى» for the admin. */
export function AdminStatus({ r }: { r: HospitalRequest }) {
  if (r.status === 0 && !r.open)
    return <span data-testid="status-badge" className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF1E6] px-2.5 py-0.5 text-xs font-medium text-medium ring-1 ring-inset ring-medium/30"><span className="size-1.5 rounded-full bg-medium" aria-hidden />بانتظار قرار المستشفى</span>
  return <StatusBadge status={r.status} open={r.open} mode={r.mode} />
}

export type Attention = 'late' | 'locked' | 'uncovered'
const MARK: Record<Attention, [string, string, typeof Lock]> = {
  late: ['متأخر', 'bg-[#FEECEC] text-urgent', AlertTriangle],
  locked: ['الرمز مقفول', 'bg-[#FEECEC] text-urgent', Lock],
  uncovered: ['ما فيه جمعية تغطيه', 'bg-[#FFF1E6] text-medium', Hourglass],
}

export function Marker({ kind }: { kind: Attention }) {
  const [label, tone, Icon] = MARK[kind]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}><Icon className="size-3" aria-hidden />{label}</span>
}

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  const [t, c] = status === 'approved' ? ['معتمدة', 'bg-[#E8F6EC] text-normal'] : status === 'pending' ? ['بانتظار المراجعة', 'bg-[#FFF1E6] text-medium'] : ['مرفوضة', 'bg-[#FEECEC] text-urgent']
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{t}</span>
}
