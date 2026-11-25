import { StatusBadge } from '../../components/ui/Badge'
import type { RequestStatus } from '../../lib/labels'

/** Status badge; status 0 reads «طلب مفتوح» in this phase. */
export function RequestStatusBadge({ status, open = true }: { status: RequestStatus; open?: boolean }) {
  if (status !== 0) return <StatusBadge status={status} />
  // Status 0: published for any charity, or (after a rejection) waiting for the hospital to decide.
  const [label, cls] = open
    ? ['طلب مفتوح', 'bg-status-0/10 text-status-0 ring-status-0/20']
    : ['بانتظار قرارك', 'bg-medium/10 text-medium ring-medium/20']
  return (
    <span data-testid="status-badge" className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      <span className={`size-1.5 rounded-full ${open ? 'bg-status-0' : 'bg-medium'}`} aria-hidden />{label}
    </span>
  )
}

/** 6-segment progress (identity style B). */
export function RequestProgress({ status }: { status: RequestStatus }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= status ? 'bg-primary' : 'bg-line'}`} />)}
    </div>
  )
}

export const shortDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long' })
export const longDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' })
