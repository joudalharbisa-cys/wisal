import type { ReactNode } from 'react'

export default function Card({ title, action, children, flush }: { title?: string; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          {action}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  )
}
