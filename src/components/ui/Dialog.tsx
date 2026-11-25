import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Modal dialog: labelled by its title, closes on Escape, backdrop click or the close button. */
export default function Dialog({ title, sub, icon, onClose, footer, children }: { title: string; sub?: ReactNode; icon?: ReactNode; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Focus the first field so keyboard users land inside the dialog.
    box.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg rounded-card bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b border-line px-6 py-5">
          {icon && <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-light text-accent">{icon}</span>}
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold">{title}</h2>
            {sub && <p className="text-sm text-muted">{sub}</p>}
          </div>
          <button type="button" data-close aria-label="إغلاق" onClick={onClose} className="ms-auto grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-surface">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
