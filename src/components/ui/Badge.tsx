import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type RequestStatus } from '../../lib/labels'
import { CONDITION_LABEL, type Condition } from '../../features/inventory/types'
import type { OrgRole } from '../../features/orgs/types'

// Literal class strings so Tailwind generates them. Soft tint + colored text + dot.
const PRIORITY_CLASS: Record<Priority, [string, string]> = {
  urgent: ['bg-urgent/10 text-urgent ring-urgent/20', 'bg-urgent'],
  medium: ['bg-medium/15 text-medium ring-medium/30', 'bg-medium'],
  normal: ['bg-normal/10 text-normal ring-normal/20', 'bg-normal'],
}

const STATUS_CLASS: Record<RequestStatus, [string, string]> = {
  0: ['bg-status-0/10 text-status-0 ring-status-0/20', 'bg-status-0'],
  1: ['bg-status-1/10 text-status-1 ring-status-1/20', 'bg-status-1'],
  2: ['bg-status-2/10 text-status-2 ring-status-2/20', 'bg-status-2'],
  3: ['bg-status-3/10 text-status-3 ring-status-3/20', 'bg-status-3'],
  4: ['bg-status-4/10 text-status-4 ring-status-4/20', 'bg-status-4'],
  5: ['bg-status-5/10 text-status-5 ring-status-5/20', 'bg-status-5'],
}

const BASE = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset'

export function PriorityBadge({ priority }: { priority: Priority }) {
  const [c, dot] = PRIORITY_CLASS[priority]
  return (
    <span className={`${BASE} ${c}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const [c, dot] = STATUS_CLASS[status]
  return (
    <span data-testid="status-badge" className={`${BASE} ${c}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

const CONDITION_CLASS: Record<Condition, [string, string]> = {
  new: ['bg-primary-light text-primary-dark ring-primary/20', 'bg-primary'],
  used: ['bg-accent-light text-accent ring-accent/25', 'bg-accent'],
}

export function ConditionBadge({ condition }: { condition: Condition }) {
  const [c, dot] = CONDITION_CLASS[condition]
  return (
    <span className={`${BASE} ${c}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {CONDITION_LABEL[condition]}
    </span>
  )
}

export function RoleBadge({ role }: { role: OrgRole }) {
  return role === 'hospital'
    ? <span className={`${BASE} bg-hospital/10 text-hospital ring-hospital/20`}>مستشفى</span>
    : <span className={`${BASE} bg-charity/10 text-charity ring-charity/20`}>جمعية</span>
}