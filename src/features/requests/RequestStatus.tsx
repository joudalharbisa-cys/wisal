import { StatusBadge } from '../../components/ui/Badge'
import { hospitalStatus, type DeliveryMode, type RequestStatus } from '../../lib/labels'

/** Status badge for a request (status 0 by `open`, status 4 by delivery mode). `hospital`: stops at «وصل». */
export function RequestStatusBadge({ status, open = true, mode, hospital }: { status: RequestStatus; open?: boolean; mode?: DeliveryMode; hospital?: boolean }) {
  return <StatusBadge status={hospital ? hospitalStatus(status) : status} open={open} mode={mode} hospital={hospital} />
}

/** Segmented progress (identity style B): 7 steps, or 6 for the hospital (no code-check step). */
export function RequestProgress({ status, hospital }: { status: RequestStatus; hospital?: boolean }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: hospital ? 6 : 7 }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= status ? 'bg-primary' : 'bg-line'}`} />)}
    </div>
  )
}

export const shortDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long' })
export const longDate = (d: Date) => d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' })
