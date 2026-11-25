import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

/** Label + one control + hint/error. The control's accessible name is the label only; hint/error are its description. */
export default function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { id, 'aria-describedby': note ? noteId : undefined })
    : children
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {control}
      {error ? (
        <span id={noteId} role="alert" className="mt-1 block text-xs text-urgent">{error}</span>
      ) : (
        hint && <span id={noteId} className="mt-1 block text-xs text-muted">{hint}</span>
      )}
    </div>
  )
}
