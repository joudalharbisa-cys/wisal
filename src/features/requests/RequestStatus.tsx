import { StatusBadge } from '../../components/ui/Badge'
import type { DeliveryMode, RequestStatus } from '../../lib/labels'

/** Status badge for a request (status 0 by `open`, status 4 by delivery mode). */
export function RequestStatusBadge({ status, open = true, mode }: { status: RequestStatus; open?: boolean; mode?: DeliveryMode }) {
  return <StatusBadge status={status} open={open} mode={mode} />
}

/** 7-segment progress (identity style B). */
export function RequestProgress({ status }: { status: RequestStatus }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= status ? 'bg-primary' : 'bg-line'}`} />)}
    </div>
  )
}

export const shortDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long' })
export const longDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' })
