import { useId, type ComponentType } from 'react'

export type Choice<T extends string> = { value: T; label: string; hint?: string; icon?: ComponentType<{ className?: string }> }

/** Accessible single-choice cards (radiogroup). */
export default function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: {
  label: string
  options: Choice<T>[]
  value?: T
  onChange: (v: T) => void
  error?: string
  columns?: 2 | 3
}) {
  const id = useId()
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className={`grid gap-3 ${columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-2'}`}>
        {options.map(o => {
          const on = o.value === value
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.label}
              aria-describedby={o.hint ? `${id}-${o.value}` : undefined}
              onClick={() => onChange(o.value)}
              className={`flex items-center gap-3 rounded-card border p-4 text-start transition ${
                on ? 'border-primary bg-primary-light/60 ring-1 ring-primary' : 'border-line bg-white hover:border-muted/40'
              }`}
            >
              {Icon && <Icon className={`size-6 shrink-0 ${on ? 'text-primary' : 'text-muted'}`} />}
              <span>
                <span className={`block text-sm ${on ? 'font-bold text-primary-dark' : 'font-medium'}`}>{o.label}</span>
                {o.hint && <span id={`${id}-${o.value}`} className="block text-xs text-muted">{o.hint}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {error && <span role="alert" className="mt-1 block text-xs text-urgent">{error}</span>}
    </div>
  )
}
