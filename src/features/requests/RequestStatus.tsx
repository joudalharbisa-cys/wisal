import { StatusBadge } from '../../components/ui/Badge'
import type { RequestStatus } from '../../lib/labels'

/** Status badge; status 0 reads «طلب مفتوح» in this phase. */
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  if (status !== 0) return <StatusBadge status={status} />
  return (
    <span data-testid="status-badge" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-status-0/10 px-2.5 py-0.5 text-xs font-medium text-status-0 ring-1 ring-inset ring-status-0/20">
      <span className="size-1.5 rounded-full bg-status-0" aria-hidden />طلب مفتوح
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
