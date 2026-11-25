import type { ReactNode } from 'react'

export default function Stat({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {icon && <span className="grid size-10 place-items-center rounded-full bg-primary-light text-primary">{icon}</span>}
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  )
}
