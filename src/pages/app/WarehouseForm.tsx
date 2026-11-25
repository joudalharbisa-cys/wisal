import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Crosshair, Info, Trash2 } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Dialog from '../../components/ui/Dialog'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import { useAddressFromPin } from '../../features/geo/useAddressFromPin'
import { getCurrentLocation } from '../../features/inventory/geo'
import LocationMap from '../../features/inventory/LocationMap'
import type { LatLng, StockRow, Warehouse, WarehouseDraft } from '../../features/inventory/types'
import { parseCoord, validateWarehouse } from '../../features/inventory/validate'
import { CITIES, CITY_CENTERS } from '../../features/orgs/cities'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const CARD = 'overflow-hidden rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'
const isCity = (c: string): c is (typeof CITIES)[number] => (CITIES as readonly string[]).includes(c)

/** Create (/app/warehouses/new) or edit (/app/warehouses/:id) a warehouse, with its location on a map. */
export default function WarehouseForm() {
  const { id } = useParams()
  const session = useCurrentSession()
  const { inventory } = useServices()
  const navigate = useNavigate()
  const uid = session.kind === 'member' ? session.user.uid : ''
  const org = session.kind === 'member' ? session.org : null

  const [draft, setDraft] = useState<WarehouseDraft>({ name: '', city: org && isCity(org.city) ? org.city : 'جدة', district: '', location: null })
  const [list, setList] = useState<Warehouse[] | null>(null)
  const [rows, setRows] = useState<StockRow[]>([])
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof validateWarehouse>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [geoFailed, setGeoFailed] = useState(false)
  const [locating, setLocating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [coordText, setCoordText] = useState<{ lat?: string; lng?: string }>({})
  // Pin placed by the user (not a loaded warehouse) → look up its district/city; fields typed since then win.
  const [userPin, setUserPin] = useState<LatLng | null>(null)
  const touched = useRef({ city: false, district: false })

  useEffect(() => {
    if (!uid || !id) return
    const fail = () => setLoadFailed(true)
    const stops = [inventory.watchWarehouses(uid, setList, fail), inventory.watchStock(uid, setRows, fail)]
    return () => stops.forEach(s => s())
  }, [inventory, uid, id])

  const existing = id ? list?.find(w => w.id === id) : undefined
  useEffect(() => {
    if (existing && loadedId !== existing.id) {
      setDraft({ name: existing.name, city: existing.city, district: existing.district, location: existing.location })
      setLoadedId(existing.id)
    }
  }, [existing, loadedId])

  useAddressFromPin(userPin, a => setDraft(d => ({
    ...d,
    city: a.city && !touched.current.city ? a.city : d.city,
    district: a.district && !touched.current.district ? a.district : d.district,
  })))

  if (session.kind !== 'member' || !org) return null
  const title = id ? 'تعديل المستودع' : 'مستودع جديد'

  if (id && loadFailed) {
    return <AppShell title={title}><Alert tone="danger">تعذّر تحميل المخزون، تأكد من الاتصال وحاول مرة ثانية</Alert></AppShell>
  }
  // Keep the spinner until the warehouse's values are in the fields (no flash of an empty form).
  if (id && (list === null || (existing && loadedId !== existing.id))) {
    return <AppShell title={title}><div className="grid place-items-center rounded-card bg-white p-12 text-primary"><Spinner className="size-7" /></div></AppShell>
  }
  if (id && !existing) {
    return (
      <AppShell title={title}>
        <section className="rounded-card bg-white p-10 text-center">
          <p className="font-bold">ما لقينا هذا المستودع</p>
          <Link to="/app" className="mt-4 inline-block text-sm font-medium text-primary underline">رجوع لمخزوني</Link>
        </section>
      </AppShell>
    )
  }

  const set = <K extends keyof WarehouseDraft>(k: K, v: WarehouseDraft[K]) => setDraft(d => ({ ...d, [k]: v }))
  const userMovedPin = (p: LatLng) => { setUserPin(p); touched.current = { city: false, district: false } }
  const place = (p: LatLng) => { set('location', p); setCoordText({}); userMovedPin(p); setErrors(e => ({ ...e, location: undefined })) }
  // What the user typed wins; otherwise show the pin's position.
  const coordValue = (k: 'lat' | 'lng') => coordText[k] ?? (draft.location ? draft.location[k].toFixed(4) : '')
  const typeCoord = (k: 'lat' | 'lng', v: string) => {
    const next = { lat: coordValue('lat'), lng: coordValue('lng'), [k]: v }
    setCoordText(t => ({ ...t, [k]: v }))
    const lat = parseCoord(next.lat)
    const lng = parseCoord(next.lng)
    set('location', lat !== null && lng !== null ? { lat, lng } : null)
    if (lat !== null && lng !== null) userMovedPin({ lat, lng })
  }
  const rowCount = id ? rows.filter(r => r.warehouseId === id).length : 0

  const locate = async () => {
    setLocating(true)
    setGeoFailed(false)
    try {
      place(await getCurrentLocation())
    } catch {
      setGeoFailed(true)
    } finally {
      setLocating(false)
    }
  }

  const save = async () => {
    const e = validateWarehouse(draft)
    setErrors(e)
    if (Object.keys(e).length > 0 || !draft.location) return
    setSaving(true)
    setFailed(false)
    try {
      await inventory.saveWarehouse({ uid, name: org.name, role: org.role }, id ?? null, { ...draft, location: draft.location })
      navigate('/app')
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!id) return
    setDeleting(true)
    setFailed(false)
    try {
      await inventory.deleteWarehouse(uid, id)
      navigate('/app')
    } catch {
      setFailed(true)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const center = draft.location ?? (isCity(draft.city) ? CITY_CENTERS[draft.city] : CITY_CENTERS['جدة'])

  return (
    <AppShell title={title} sub={org.role === 'charity' ? 'المستشفيات تشوف موقع المستودع عشان تعرف المسافة لما تطلب' : 'حدد مكان المستودع على الخريطة'}>
      <section className={CARD}>
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-5 p-6">
            <Field label="اسم المستودع" error={errors.name}>
              <Input value={draft.name} onChange={e => set('name', e.target.value)} invalid={!!errors.name} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="المدينة" error={errors.city}>
                <Select value={draft.city} onChange={e => { touched.current.city = true; set('city', e.target.value) }} invalid={!!errors.city}>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="الحي" error={errors.district}>
                <Input value={draft.district} onChange={e => { touched.current.district = true; set('district', e.target.value) }} invalid={!!errors.district} />
              </Field>
            </div>
            <div className="flex gap-2.5 rounded-control bg-primary-light/60 p-3.5 text-sm text-primary-dark">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>اضغط على الخريطة او حرّك الدبوس لمكان المستودع بالضبط، او اضغط «موقعي الحالي» إذا كنت فيه الحين.</p>
            </div>
            {/* Typing coordinates is the keyboard path to a location (and works when geolocation is refused). */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="خط العرض">
                <Input dir="ltr" inputMode="decimal" autoComplete="off" placeholder="21.5433" value={coordValue('lat')} onChange={e => typeCoord('lat', e.target.value)} className="text-end tabular-nums" />
              </Field>
              <Field label="خط الطول">
                <Input dir="ltr" inputMode="decimal" autoComplete="off" placeholder="39.1728" value={coordValue('lng')} onChange={e => typeCoord('lng', e.target.value)} className="text-end tabular-nums" />
              </Field>
            </div>
            {errors.location && <Alert tone="danger">{errors.location}</Alert>}
            {geoFailed && <Alert tone="warning">ما قدرنا نحدد موقعك، حرّك الدبوس يدويًا</Alert>}
          </div>
          <div className="relative min-h-[420px] border-t border-line lg:border-s lg:border-t-0">
            <LocationMap center={center} value={draft.location} onChange={place} />
            <div className="absolute start-4 top-4 z-[500]">
              <Button variant="outline" className="shadow-md" loading={locating} onClick={locate}><Crosshair className="size-4" /> موقعي الحالي</Button>
            </div>
          </div>
        </div>
        {failed && <div className="px-6 pb-4"><Alert tone="danger">ما قدرنا نحفظ، حاول مرة ثانية</Alert></div>}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          {id && <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /> حذف المستودع</Button>}
          <div className="ms-auto flex gap-2">
            <Button variant="outline" onClick={() => navigate('/app')}>إلغاء</Button>
            <Button variant="secondary" className="px-6" loading={saving} onClick={save}>حفظ المستودع</Button>
          </div>
        </div>
      </section>

      {confirmDelete && (
        <Dialog title="حذف المستودع" icon={<Trash2 className="size-5" />} onClose={() => setConfirmDelete(false)}
          footer={<>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>إلغاء</Button>
            <Button variant="danger" loading={deleting} onClick={remove}>حذف</Button>
          </>}>
          <p>{rowCount > 0 ? `حذف المستودع ومعه ${rowCount} منتج؟` : 'حذف المستودع؟'}</p>
        </Dialog>
      )}
    </AppShell>
  )
}
