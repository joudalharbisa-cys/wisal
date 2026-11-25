import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, MapPin, Package, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { ConditionBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Dialog from '../../components/ui/Dialog'
import Spinner from '../../components/ui/Spinner'
import Stat from '../../components/ui/Stat'
import Table from '../../components/ui/Table'
import StockDialog from '../../features/inventory/StockDialog'
import { CONDITION_LABEL, type Item, type OrgRef, type StockRow, type Warehouse } from '../../features/inventory/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={`grid size-8 place-items-center rounded-control text-muted transition ${danger ? 'hover:bg-urgent/5 hover:text-urgent' : 'hover:bg-surface hover:text-ink'}`}>
      {children}
    </button>
  )
}

function WarehouseCard({ wh, rows, onAdd, onEdit, onDelete }: { wh: Warehouse; rows: StockRow[]; onAdd: () => void; onEdit: (r: StockRow) => void; onDelete: (r: StockRow) => void }) {
  const titleId = useId()
  const navigate = useNavigate()
  const sorted = [...rows].sort((a, b) => a.itemName.localeCompare(b.itemName, 'ar') || a.condition.localeCompare(b.condition))
  return (
    <section aria-labelledby={titleId} className={CARD}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid size-10 place-items-center rounded-full bg-primary-light text-primary"><WarehouseIcon className="size-5" /></span>
        <div>
          <h2 id={titleId} className="font-bold">{wh.name}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5" />{wh.city}، {wh.district}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" aria-label={`إضافة منتج إلى ${wh.name}`} onClick={onAdd}><Plus className="size-4" /> منتج</Button>
          <Button variant="outline" onClick={() => navigate(`/app/warehouses/${wh.id}`)}><Pencil className="size-4" /> تعديل المستودع</Button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">ما فيه منتجات في هذا المستودع للحين</p>
      ) : (
        <Table
          columns={['المنتج', 'الحالة', 'الكمية', '']}
          rows={sorted.map(r => [
            <span className="font-medium">{r.itemName}</span>,
            <ConditionBadge condition={r.condition} />,
            r.qty === 0 ? <span className="text-sm font-medium text-urgent">نفد</span> : <span className="font-bold tabular-nums">{r.qty}</span>,
            <div className="flex justify-end gap-1">
              <IconButton label={`تعديل كمية ${r.itemName} ${CONDITION_LABEL[r.condition]}`} onClick={() => onEdit(r)}><Pencil className="size-4" /></IconButton>
              <IconButton danger label={`حذف ${r.itemName} ${CONDITION_LABEL[r.condition]}`} onClick={() => onDelete(r)}><Trash2 className="size-4" /></IconButton>
            </div>,
          ])}
        />
      )}
    </section>
  )
}

/** Approved org home (phase 2): its warehouses and the stock inside each. */
export default function MyStock() {
  const session = useCurrentSession()
  const { inventory } = useServices()
  const navigate = useNavigate()
  const uid = session.kind === 'member' ? session.user.uid : ''
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null)
  const [rows, setRows] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [dialog, setDialog] = useState<{ wh: Warehouse; editing?: StockRow } | null>(null)
  const [deleting, setDeleting] = useState<StockRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)

  useEffect(() => {
    if (!uid) return
    const stops = [inventory.watchWarehouses(uid, setWarehouses), inventory.watchStock(uid, setRows), inventory.watchItems(setItems)]
    return () => stops.forEach(s => s())
  }, [inventory, uid])

  if (session.kind !== 'member' || !session.org) return null
  const owner: OrgRef = { uid, name: session.org.name, role: session.org.role }
  const pieces = rows.reduce((n, r) => n + r.qty, 0)

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    setDeleteFailed(false)
    try {
      await inventory.deleteStock(uid, deleting.id)
      setDeleting(null)
    } catch {
      setDeleteFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell
      title="مخزوني"
      sub="الي تضيفه هنا يشوفه المستشفيات والجمعيات المقبولة في وصال"
      action={warehouses && warehouses.length > 0 && (
        <Button variant="secondary" className="h-11 px-5" onClick={() => navigate('/app/warehouses/new')}><Plus className="size-4" /> مستودع جديد</Button>
      )}
    >
      {warehouses === null ? (
        <div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div>
      ) : warehouses.length === 0 ? (
        <section className="rounded-card bg-white p-12 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary-light text-primary"><WarehouseIcon className="size-8" /></span>
          <h2 className="mt-5 text-lg font-bold">ابدأ بإضافة أول مستودع</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">حدد مكان المستودع على الخريطة، وبعدها أضف المنتجات الي فيه وكمياتها.</p>
          <Button variant="secondary" className="mt-6 h-11 px-6" onClick={() => navigate('/app/warehouses/new')}><Plus className="size-4" /> أضف مستودع</Button>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="المستودعات" value={warehouses.length} icon={<WarehouseIcon className="size-5" />} />
            <Stat label="المنتجات" value={rows.length} icon={<Package className="size-5" />} />
            <Stat label="إجمالي القطع" value={pieces} icon={<Boxes className="size-5" />} />
          </div>
          {warehouses.map(w => (
            <WarehouseCard key={w.id} wh={w} rows={rows.filter(r => r.warehouseId === w.id)}
              onAdd={() => setDialog({ wh: w })} onEdit={r => setDialog({ wh: w, editing: r })} onDelete={r => { setDeleteFailed(false); setDeleting(r) }} />
          ))}
        </div>
      )}

      {dialog && (
        <StockDialog warehouse={dialog.wh} editing={dialog.editing} items={items} rows={rows.filter(r => r.warehouseId === dialog.wh.id)}
          onClose={() => setDialog(null)} onSave={(choice, condition, qty) => inventory.setStock(owner, dialog.wh, choice, condition, qty)} />
      )}
      {deleting && (
        <Dialog title="حذف منتج" icon={<Trash2 className="size-5" />} onClose={() => setDeleting(null)}
          footer={<>
            <Button variant="outline" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button variant="danger" loading={busy} onClick={confirmDelete}>حذف</Button>
          </>}>
          <p>حذف «{deleting.itemName} · {CONDITION_LABEL[deleting.condition]}» من {deleting.warehouseName}؟</p>
          {deleteFailed && <Alert tone="danger">ما قدرنا نحذف، حاول مرة ثانية</Alert>}
        </Dialog>
      )}
    </AppShell>
  )
}
