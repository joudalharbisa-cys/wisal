import { useState } from 'react'
import { PackagePlus, PencilLine } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { ConditionBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ChoiceGroup from '../../components/ui/ChoiceGroup'
import Dialog from '../../components/ui/Dialog'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import { normalizeName } from './names'
import ProductPicker from './ProductPicker'
import { CONDITION_LABEL, type Condition, type Item, type ItemChoice, type StockRow, type Warehouse } from './types'
import { parseQty } from './validate'

/** Add a product to a warehouse, or (editing) change one row's quantity. */
export default function StockDialog({ warehouse, rows, items, editing, onClose, onSave }: {
  warehouse: Warehouse
  rows: StockRow[]
  items: Item[]
  editing?: StockRow
  onClose: () => void
  onSave: (choice: ItemChoice, condition: Condition, qty: number) => Promise<void>
}) {
  const [choice, setChoice] = useState<ItemChoice | null>(editing ? { kind: 'existing', item: { key: editing.itemId, name: editing.itemName } } : null)
  const [condition, setCondition] = useState<Condition>(editing?.condition ?? 'new')
  const [qtyText, setQtyText] = useState(editing ? String(editing.qty) : '')
  const [errors, setErrors] = useState<{ product?: string; qty?: string }>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const key = choice ? (choice.kind === 'existing' ? choice.item.key : normalizeName(choice.name)) : null
  const existing = !editing && key ? rows.find(r => r.itemId === key && r.condition === condition) : undefined

  const submit = async () => {
    const qty = parseQty(qtyText)
    const e = { product: choice ? undefined : 'اختر المنتج', qty: qty === null ? 'اكتب الكمية بالأرقام من 0 إلى 99999' : undefined }
    setErrors(e)
    if (!choice || qty === null) return
    setSaving(true)
    setFailed(false)
    try {
      await onSave(choice, condition, qty)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={editing ? 'تعديل الكمية' : 'إضافة منتج'}
      sub={`${warehouse.name} · ${warehouse.city}، ${warehouse.district}`}
      icon={editing ? <PencilLine className="size-5" /> : <PackagePlus className="size-5" />}
      onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button variant="secondary" className="px-6" loading={saving} onClick={submit}>حفظ</Button>
      </>}
    >
      {editing ? (
        <div className="flex items-center gap-3 rounded-control bg-surface px-4 py-3">
          <span className="font-medium">{editing.itemName}</span>
          <ConditionBadge condition={editing.condition} />
        </div>
      ) : (
        <>
          <ProductPicker items={items} value={choice} onChange={setChoice} error={errors.product} />
          <ChoiceGroup<Condition> label="الحالة" value={condition} onChange={setCondition}
            options={[{ value: 'new', label: CONDITION_LABEL.new }, { value: 'used', label: CONDITION_LABEL.used }]} />
        </>
      )}
      {existing && <Alert tone="info">موجود في هذا المستودع بكمية {existing.qty}، الكمية الجديدة تحل محلها</Alert>}
      <Field label="الكمية" error={errors.qty} hint="عدد القطع الموجودة الحين في هذا المستودع">
        <Input inputMode="numeric" dir="ltr" autoComplete="off" value={qtyText} onChange={e => setQtyText(e.target.value)} invalid={!!errors.qty} className="text-end tabular-nums" />
      </Field>
      {failed && <Alert tone="danger">ما قدرنا نحفظ، حاول مرة ثانية</Alert>}
    </Dialog>
  )
}
