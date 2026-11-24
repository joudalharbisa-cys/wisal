import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  info: 'border-status-2 text-status-2',
  success: 'border-normal text-status-5',
  warning: 'border-medium text-status-1',
  danger: 'border-urgent text-urgent',
}

export default function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div role={role} className={`rounded-control border-s-4 bg-white px-4 py-3 ${TONE[tone]}`}>
      {children}
    </div>
  )
}
