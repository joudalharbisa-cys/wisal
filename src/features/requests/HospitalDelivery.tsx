import { useEffect, useState } from 'react'
import { Lock, Pencil, Truck, Warehouse } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useServices } from '../../services/ServicesContext'
import type { OrgRef, Warehouse as WarehouseDoc } from '../inventory/types'
import PersonForm from './PersonForm'
import { personLine } from './timeline'
import type { HospitalRequest } from './types'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

/** Five wrong codes: the hospital checks its receiver has the right code, then reopens entry. */
export function CodeLockNotice({ r, me }: { r: HospitalRequest; me: OrgRef }) {
  const { requests } = useServices()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (r.status !== 5 || (r.codeFails ?? 0) < 5) return null
  const unlock = async () => {
    setBusy(true)
    setFailed(false)
    try { await requests.unlockCode(me, r.id) } catch { setFailed(true) } finally { setBusy(false) }
  }
  return (
    <section className="flex flex-wrap items-start gap-3 rounded-card border border-urgent/30 bg-white p-5 shadow-sm">
      <Lock className="mt-0.5 size-5 shrink-0 text-urgent" aria-hidden />
      <div className="min-w-48 flex-1">
        <h2 className="font-bold">انقفل إدخال الرمز</h2>
        <p className="text-sm text-muted">الجمعية كتبت رمز غلط 5 مرات. تأكد إن المستلم عنده الرمز الصحيح، وبعدها افتح الإدخال.</p>
        {failed && <p role="alert" className="mt-2 text-sm text-urgent">ما قدرنا نحفظ، حاول مرة ثانية</p>}
      </div>
      <Button variant="outline" loading={busy} onClick={unlock}>افتح إدخال الرمز</Button>
    </section>
  )
}

/** Delivery: who is driving and when. Pickup (statuses 3–4): the hospital's courier, editable. */
export default function HospitalDelivery({ r, me }: { r: HospitalRequest; me: OrgRef }) {
  const { requests, inventory } = useServices()
  const [editing, setEditing] = useState(false)
  const [warehouses, setWarehouses] = useState<WarehouseDoc[]>([])
  const pickupCharity = r.mode === 'pickup' && r.status >= 3 && r.status <= 5 ? r.charityId : undefined
  useEffect(() => (pickupCharity ? inventory.watchWarehouses(pickupCharity, setWarehouses) : undefined), [inventory, pickupCharity])
  if (r.status < 3 || r.status > 5 || !r.mode) return null

  if (r.mode === 'delivery') {
    return (
      <section className={`${CARD} p-6`}>
        <h2 className="flex items-center gap-2 font-bold"><Truck className="size-5 text-muted" aria-hidden />التوصيل</h2>
        <p className="mt-3 text-sm">{r.driver ? personLine('السائق', r.driver, 'يوصل تقريبًا') : 'الجمعية تجهز الطلب، وبتكتب بيانات السائق لما يطلع.'}</p>
      </section>
    )
  }

  const wh = warehouses.find(w => w.id === r.warehouseId)
  const canEdit = r.status <= 4
  const showForm = canEdit && (!r.pickup || editing)
  return (
    <section className={`${CARD} p-6`}>
      <h2 className="flex items-center gap-2 font-bold"><Warehouse className="size-5 text-muted" aria-hidden />استلام من مستودع الجمعية</h2>
      <p className="mt-2 text-sm text-muted">
        {r.status === 3 ? 'الجمعية تجهز الطلب، أرسل مندوبك يستلمه من مستودعها.' : r.status === 4 ? 'الطلب جاهز للاستلام من مستودع الجمعية.' : 'وصل مندوبك للمستودع.'}
      </p>
      {wh && <p className="mt-2 text-sm font-medium">{wh.name} · {wh.city}، {wh.district}</p>}
      {showForm ? (
        <div className="mt-4">
          <PersonForm labels={{ name: 'اسم المندوب', phone: 'جوال المندوب', date: 'يوم الاستلام' }} submit="حفظ بيانات المندوب" initial={r.pickup}
            onSubmit={async p => { await requests.setPickup(me, r.id, p); setEditing(false) }} />
        </div>
      ) : r.pickup ? (
        <div className="mt-4 flex items-start gap-3 rounded-control bg-surface p-3.5 text-sm">
          <p className="flex-1">{personLine('مندوب المستشفى', r.pickup, 'يجي')}</p>
          {canEdit && <button type="button" aria-label="غيّر بيانات المندوب" onClick={() => setEditing(true)} className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-white"><Pencil className="size-4" /></button>}
        </div>
      ) : null}
    </section>
  )
}
