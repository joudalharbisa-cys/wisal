import { useId, useMemo, useState } from 'react'
import { Lightbulb, Plus, Search, Sparkles } from 'lucide-react'
import Button from '../../components/ui/Button'
import { inputClass } from '../../components/ui/Input'
import { findNearDuplicate, mergeItems, normalizeName } from './names'
import type { Item, ItemChoice } from './types'
import { validateItemName } from './validate'

/** Pick a product from the shared list or add a new one; asks "did you mean…?" before adding a near duplicate. */
export default function ProductPicker({ items, value, onChange, error }: { items: Item[]; value: ItemChoice | null; onChange: (c: ItemChoice | null) => void; error?: string }) {
  const id = useId()
  const all = useMemo(() => mergeItems(items), [items])
  const [text, setText] = useState(value ? (value.kind === 'existing' ? value.item.name : value.name) : '')
  const [open, setOpen] = useState(false)
  const [near, setNear] = useState<{ name: string; item: Item } | null>(null)
  const [nameError, setNameError] = useState<string>()
  const [active, setActive] = useState(-1)

  const q = normalizeName(text)
  const matches = q ? all.filter(i => i.key.includes(q)).slice(0, 8) : []
  const exact = all.some(i => i.key === q)
  const showAdd = q.length > 0 && !exact
  const count = matches.length + (showAdd ? 1 : 0)
  const expanded = open && count > 0
  const optId = (n: number) => `${id}-opt-${n}`

  const pick = (c: ItemChoice) => {
    setText(c.kind === 'existing' ? c.item.name : c.name)
    setOpen(false)
    setNear(null)
    onChange(c)
  }
  const addNew = () => {
    const name = text.trim()
    const bad = validateItemName(name)
    if (bad) { setNameError(bad); return }
    const n = findNearDuplicate(name, all)
    setOpen(false)
    if (n) setNear({ name, item: n })
    else pick({ kind: 'new', name })
  }

  const choose = (n: number) => (n < matches.length ? pick({ kind: 'existing', item: matches[n] }) : addNew())
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!count) return
      setOpen(true)
      setActive(a => (e.key === 'ArrowDown' ? Math.min(a + 1, count - 1) : Math.max(a - 1, 0)))
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape' && expanded) {
      e.stopPropagation() // close the list, not the dialog
      setOpen(false)
    }
  }
  const onType = (v: string) => {
    setText(v)
    setOpen(true)
    setActive(-1)
    setNear(null)
    setNameError(undefined)
    // Typing a product's exact name selects it; no click needed.
    const hit = all.find(i => i.key === normalizeName(v))
    onChange(hit ? { kind: 'existing', item: hit } : null)
  }

  const note = error ?? nameError
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">المنتج</label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id={id}
          role="combobox"
          aria-expanded={expanded}
          aria-activedescendant={expanded && active >= 0 ? optId(active) : undefined}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-invalid={note ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          autoComplete="off"
          placeholder="اكتب اسم المنتج"
          value={text}
          onChange={e => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => text && !value && setOpen(true)}
          className={`${inputClass} ps-9 ${note ? 'border-urgent focus:ring-urgent/15' : 'border-line focus:border-primary focus:ring-primary-light'}`}
        />
        {expanded && (
          <ul id={`${id}-list`} role="listbox" aria-label="المنتجات" className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-control border border-line bg-white py-1 shadow-lg">
            {matches.map((i, n) => (
              <li key={i.key} id={optId(n)} role="option" aria-selected={active === n} aria-label={i.name} onMouseDown={e => e.preventDefault()} onClick={() => choose(n)}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-surface ${active === n ? 'bg-surface' : ''}`}>{i.name}</li>
            ))}
            {showAdd && (
              <li id={optId(matches.length)} role="option" aria-selected={active === matches.length} aria-label={`أضف «${text.trim()}» كمنتج جديد`} onMouseDown={e => e.preventDefault()} onClick={addNew}
                className={`flex cursor-pointer items-center gap-2 border-t border-line px-3 py-2 text-sm font-medium text-primary hover:bg-primary-light/50 ${active === matches.length ? 'bg-primary-light/50' : ''}`}>
                <Plus className="size-4" /> أضف «{text.trim()}» كمنتج جديد
              </li>
            )}
          </ul>
        )}
      </div>
      {note && <span id={`${id}-note`} role="alert" className="mt-1 block text-xs text-urgent">{note}</span>}
      {near && (
        <div className="mt-2 overflow-hidden rounded-control border border-line">
          <div className="flex items-center gap-2 bg-medium/5 px-3 py-2.5 text-sm">
            <Lightbulb className="size-4 shrink-0 text-medium" />
            <span>فيه منتج قريب من هذا الاسم. تقصد <b>«{near.item.name}»</b>؟</span>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line bg-white px-3 py-2.5">
            <Button className="h-8 px-3 text-xs" onClick={() => pick({ kind: 'existing', item: near.item })}>نعم، اختره</Button>
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => pick({ kind: 'new', name: near.name })}><Sparkles className="size-3.5" /> لا، أضفه كمنتج جديد</Button>
          </div>
        </div>
      )}
    </div>
  )
}
