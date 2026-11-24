import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type RequestStatus } from '../../lib/labels'

const PRIORITY_CLASS: Record<Priority, string> = {
  urgent: 'bg-urgent',
  medium: 'bg-medium',
  normal: 'bg-normal',
}

const STATUS_CLASS: Record<RequestStatus, string> = {
  0: 'bg-status-0',
  1: 'bg-status-1',
  2: 'bg-status-2',
  3: 'bg-status-3',
  4: 'bg-status-4',
  5: 'bg-status-5',
}

const BASE = 'inline-block rounded-full px-3 py-0.5 text-sm font-bold text-white'

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${BASE} ${PRIORITY_CLASS[priority]}`}>{PRIORITY_LABEL[priority]}</span>
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span data-testid="status-badge" className={`${BASE} ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
