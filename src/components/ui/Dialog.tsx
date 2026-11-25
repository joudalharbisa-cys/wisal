import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Modal dialog: labelled by its title, closes on Escape, backdrop click or the close button. */
export default function Dialog({ title, sub, icon, onClose, footer, children }: { title: string; sub?: ReactNode; icon?: ReactNode; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  // Callers pass inline handlers; keep the latest in a ref so re-renders don't re-run the focus effect.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    // Once, on open: land keyboard users on the first field; on close, give focus back to what opened the dialog.
    box.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) closeRef.current() }}>
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
