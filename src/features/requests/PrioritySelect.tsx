import { PRIORITY_LABEL, type Priority } from '../../lib/labels'

// `pill`: tinted background behind the selected word so it reads clearly on the light card.
const OPTIONS: { value: Priority; hint: string; dot: string; on: string; pill: string }[] = [
  { value: 'urgent', hint: 'خلال 6 ساعات', dot: 'bg-urgent', on: 'border-urgent bg-urgent/5 ring-1 ring-urgent text-urgent', pill: 'bg-urgent/15' },
  { value: 'medium', hint: 'خلال يوم', dot: 'bg-medium', on: 'border-medium bg-medium/5 ring-1 ring-medium text-medium', pill: 'bg-medium/15' },
  { value: 'normal', hint: 'خلال 3 أيام', dot: 'bg-normal', on: 'border-normal bg-normal/5 ring-1 ring-normal text-normal', pill: 'bg-normal/15' },
]

/** Three priority cards in the priority colours (radiogroup). */
export default function PrioritySelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">الأولوية</span>
      <div role="radiogroup" aria-label="الأولوية" className="grid grid-cols-3 gap-3">
        {OPTIONS.map(o => {
          const on = o.value === value
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} aria-label={PRIORITY_LABEL[o.value]} onClick={() => onChange(o.value)}
              className={`rounded-card border p-3.5 text-start transition ${on ? o.on : 'border-line bg-white hover:border-muted/40'}`}>
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${o.dot}`} aria-hidden />
                <span className={`text-sm ${on ? `rounded-full px-2 py-0.5 font-bold ${o.pill}` : 'font-medium text-ink'}`}>{PRIORITY_LABEL[o.value]}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
