import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Crosshair, Eye, KeyRound, MapPin, Package, Plus, Send, Sparkles } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import { PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ChoiceGroup from '../../components/ui/ChoiceGroup'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import { useAddressFromPin } from '../../features/geo/useAddressFromPin'
import { getCurrentLocation } from '../../features/inventory/geo'
import LocationMap from '../../features/inventory/LocationMap'
import { normalizeName } from '../../features/inventory/names'
import { parseCoord } from '../../features/inventory/validate'
import ProductPicker from '../../features/inventory/ProductPicker'
import type { Item, LatLng, Warehouse } from '../../features/inventory/types'
import { CITIES, CITY_CENTERS } from '../../features/orgs/cities'
import PrioritySelect from '../../features/requests/PrioritySelect'
import { rankCharities } from '../../features/requests/rank'
import RankingList from '../../features/requests/RankingList'
import { ACCEPT_LABEL, type Accept, type Ranked, type RequestDraft, type ValidRequest } from '../../features/requests/types'
import { lastAllowedDay, validateRequest } from '../../features/requests/validate'
import DatePicker from '../../components/ui/DatePicker'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'
import { onlyDigits } from '../../lib/digits'

const CARD = 'rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'
const isCity = (c: string): c is (typeof CITIES)[number] => (CITIES as readonly string[]).includes(c)

const EMPTY: RequestDraft = {
  item: null, qty: '', accept: 'any', priority: 'medium', beneficiaries: '', neededBy: '',
  receiverName: '', receiverPhone: '', delivery: null, city: '', district: '', details: '',
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-white">{n}</span>
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </section>
  )
}

type Sent = { id: string; code: string; charityName: string | null }

/** Hospital: fill a request → see suitable charities ranked → send (or publish as open) → receipt code. */
export default function NewRequest() {
  const session = useCurrentSession()
  const { inventory, requests } = useServices()
  const navigate = useNavigate()
  const uid = session.kind === 'member' ? session.user.uid : ''
  const org = session.kind === 'member' ? session.org : null

  const [draft, setDraft] = useState<RequestDraft>(EMPTY)
  const [formKey, setFormKey] = useState(0)
  const [items, setItems] = useState<Item[]>([])
  const [errors, setErrors] = useState<ReturnType<typeof validateRequest>['errors']>({})
  const [step, setStep] = useState<'form' | 'rank' | 'sent'>('form')
  const [valid, setValid] = useState<ValidRequest | null>(null)
  const [ranked, setRanked] = useState<Ranked[]>([])
  const [tooSmall, setTooSmall] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoFailed, setGeoFailed] = useState(false)
  const [userPin, setUserPin] = useState<LatLng | null>(null)
  const touched = useRef({ city: false, district: false })
  const prefilled = useRef(false)
  const [coordText, setCoordText] = useState<{ lat?: string; lng?: string }>({})
  const [errorTick, setErrorTick] = useState(0)
  const firstStep = useRef(true)

  // Screen readers and keyboards follow the flow: each new step focuses its heading…
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return }
    const h = document.querySelector<HTMLElement>('main h1')
    if (h) { h.tabIndex = -1; h.focus() }
  }, [step])
  // …and a failed check focuses the first field with a problem.
  useEffect(() => {
    if (errorTick) document.querySelector<HTMLElement>('main [aria-invalid="true"]')?.focus()
  }, [errorTick])

  useEffect(() => {
    if (!uid) return
    const stops = [
      inventory.watchItems(setItems),
      // Default delivery place: the hospital's first warehouse.
      inventory.watchWarehouses(uid, (ws: Warehouse[]) => {
        const w = ws[0]
        if (!w || prefilled.current) return
        prefilled.current = true
        setDraft(d => (d.delivery ? d : { ...d, delivery: w.location, city: d.city || w.city, district: d.district || w.district }))
      }),
    ]
    return () => stops.forEach(s => s())
  }, [inventory, uid])

  useAddressFromPin(userPin, a => setDraft(d => ({
    ...d,
    city: a.city && !touched.current.city ? a.city : d.city,
    district: a.district && !touched.current.district ? a.district : d.district,
  })))

  if (session.kind !== 'member' || !org) return null
  if (org.role !== 'hospital') return <Navigate to="/app" replace />

  const set = <K extends keyof RequestDraft>(k: K, v: RequestDraft[K]) => setDraft(d => ({ ...d, [k]: v }))
  const pinMoved = (p: LatLng) => {
    setUserPin(p)
    touched.current = { city: false, district: false }
    setErrors(e => ({ ...e, delivery: undefined }))
  }
  const place = (p: LatLng) => { set('delivery', p); setCoordText({}); pinMoved(p) }
  // Typed coordinates: the keyboard path to a place (and the fallback when location access is refused).
  const coordValue = (k: 'lat' | 'lng') => coordText[k] ?? (draft.delivery ? draft.delivery[k].toFixed(4) : '')
  const typeCoord = (k: 'lat' | 'lng', v: string) => {
    const next = { lat: coordValue('lat'), lng: coordValue('lng'), [k]: v }
    setCoordText(t => ({ ...t, [k]: v }))
    const lat = parseCoord(next.lat)
    const lng = parseCoord(next.lng)
    const p = lat !== null && lng !== null ? { lat, lng } : null
    set('delivery', p)
    if (p) pinMoved(p)
  }
  const locate = async () => {
    setLocating(true)
    setGeoFailed(false)
    try { place(await getCurrentLocation()) } catch { setGeoFailed(true) } finally { setLocating(false) }
  }

  const showCharities = async () => {
    const { value, errors: e } = validateRequest(draft, new Date())
    setErrors(e)
    if (!value) { setErrorTick(t => t + 1); return }
    setValid(value)
    setLoading(true)
    setLoadFailed(false)
    try {
      const itemId = value.item.kind === 'existing' ? value.item.item.key : normalizeName(value.item.name)
      const candidates = await requests.loadCandidates(itemId)
      const r = rankCharities({ itemId, qty: value.qty, accept: value.accept, priority: value.priority, delivery: value.delivery }, candidates)
      setRanked(r)
      setTooSmall(candidates.charities.length - r.length)
      setChosen(null)
      setSendFailed(false)
      setStep('rank')
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const send = async (to: Ranked | null) => {
    if (!valid) return
    setSending(true)
    setSendFailed(false)
    try {
      const choice = to ? { charityId: to.charity.id, charityName: to.charity.name, warehouseId: to.warehouse.id } : null
      const { id, code } = await requests.send({ uid, name: org.name, role: org.role }, valid, choice)
      setSent({ id, code, charityName: to?.charity.name ?? null })
      setStep('sent')
    } catch {
      setSendFailed(true)
    } finally {
      setSending(false)
    }
  }

  const another = () => {
    setDraft(d => ({ ...EMPTY, priority: d.priority, neededBy: d.neededBy, receiverName: d.receiverName, receiverPhone: d.receiverPhone, delivery: d.delivery, city: d.city, district: d.district, details: d.details }))
    setFormKey(k => k + 1) // fresh product picker
    setErrors({})
    setSent(null)
    setStep('form')
  }

  if (step === 'sent' && sent) {
    return (
      <AppShell title="تم إرسال الطلب">
        <section className={`${CARD} mx-auto max-w-xl p-10 text-center`}>
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-normal/10 text-normal"><CheckCircle2 className="size-9" /></span>
          <h2 className="mt-5 text-xl font-bold">{sent.charityName ? `وصل طلبك لـ${sent.charityName}` : 'انتشر طلبك كطلب مفتوح'}</h2>
          <p className="mt-1.5 text-sm text-muted">{valid && `${valid.qty} · ${valid.item.kind === 'existing' ? valid.item.item.name : valid.item.name}`} · {sent.charityName ? 'بانتظار موافقة الجمعية' : 'أي جمعية عندها الكمية تقدر تقبله'}</p>
          <div className="mx-auto mt-7 max-w-xs rounded-card border-2 border-dashed border-accent/50 bg-accent-light px-6 py-5">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-accent"><KeyRound className="size-4" /> رمز الاستلام</div>
            <div dir="ltr" aria-label="رمز الاستلام" className="mt-2 text-4xl font-bold tracking-[0.4em] tabular-nums text-ink">{sent.code}</div>
          </div>
          <p className="mt-3 text-xs text-muted">اعطِ الرمز للمندوب عند الاستلام بس. تلقاه بعدين في تفاصيل الطلب.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => navigate(`/app/requests/${sent.id}`)}><Eye className="size-4" /> اعرض الطلب</Button>
            <Button variant="secondary" onClick={another}><Plus className="size-4" /> اطلب منتج ثاني</Button>
          </div>
        </section>
      </AppShell>
    )
  }

  if (step === 'rank' && valid) {
    const pick = ranked.find(r => r.charity.id === chosen) ?? null
    return (
      <AppShell title="الجمعيات المناسبة" sub="مرتبة حسب القرب والكمية والوقت المطلوب">
        <div className="space-y-6">
          <section className={`${CARD} flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4`}>
            <span className="flex items-center gap-2 font-bold"><Package className="size-5 text-primary" /> {valid.item.kind === 'existing' ? valid.item.item.name : valid.item.name} · <span className="tabular-nums">{valid.qty}</span></span>
            <PriorityBadge priority={valid.priority} />
            <span className="text-sm text-muted">{ACCEPT_LABEL[valid.accept]}</span>
            <span className="flex items-center gap-1 text-sm text-muted"><MapPin className="size-4" /> {valid.delivery.city}، {valid.delivery.district}</span>
            <Button variant="outline" className="ms-auto" onClick={() => setStep('form')}><ArrowRight className="size-4" /> رجوع للطلب</Button>
          </section>

          {ranked.length === 0 ? (
            <section className={`${CARD} p-10 text-center`}>
              <h2 className="text-lg font-bold">ما فيه جمعية عندها الكمية للحين</h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">تقدر تنشره كطلب مفتوح، وأول جمعية يصير عندها الكمية تقدر تقبله.</p>
              <Button variant="secondary" className="mt-6 h-11 px-6" loading={sending} onClick={() => send(null)}>انشره كطلب مفتوح</Button>
            </section>
          ) : (
            <>
              <RankingList ranked={ranked} chosen={chosen} onChoose={setChosen} />
              {pick && (
                <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-primary-dark px-5 py-4 text-white shadow-lg">
                  <p className="text-sm">بيوصل الطلب لـ<b>{pick.charity.name}</b> وتنتظر موافقتها</p>
                  <Button variant="secondary" className="h-11 px-6" loading={sending} onClick={() => send(pick)}><Send className="size-4" /> أرسل الطلب لـ{pick.charity.name}</Button>
                </div>
              )}
            </>
          )}
          {tooSmall > 0 && <p className="text-center text-xs text-muted">{tooSmall === 1 ? 'جمعية وحدة عندها المنتج بس كميتها ما تكفي الطلب' : `${tooSmall} جهات عندها المنتج بس كميتها ما تكفي الطلب`}</p>}
          {sendFailed && <Alert tone="danger">ما قدرنا نرسل الطلب، حاول مرة ثانية</Alert>}
        </div>
      </AppShell>
    )
  }

  const today = new Date()
  const center = draft.delivery ?? (isCity(draft.city) ? CITY_CENTERS[draft.city] : CITY_CENTERS['جدة'])
  return (
    <AppShell title="طلب جديد" sub="عبّي الطلب، ونطلع لك الجمعيات الي عندها الكمية مرتبة">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <Section n={1} title="وش تحتاج؟">
            <ProductPicker key={formKey} items={items} value={draft.item} onChange={c => set('item', c)} error={errors.item} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="الكمية" error={errors.qty}><Input inputMode="numeric" dir="ltr" autoComplete="off" value={draft.qty} onChange={e => set('qty', onlyDigits(e.target.value, 5))} invalid={!!errors.qty} className="text-end tabular-nums" /></Field>
              <Field label="عدد المستفيدين" error={errors.beneficiaries}><Input inputMode="numeric" dir="ltr" autoComplete="off" value={draft.beneficiaries} onChange={e => set('beneficiaries', onlyDigits(e.target.value, 7))} invalid={!!errors.beneficiaries} className="text-end tabular-nums" /></Field>
            </div>
            <ChoiceGroup<Accept> label="الحالة المقبولة" value={draft.accept} onChange={v => set('accept', v)} options={[{ value: 'new', label: ACCEPT_LABEL.new }, { value: 'any', label: ACCEPT_LABEL.any }]} />
            <PrioritySelect value={draft.priority} onChange={p => set('priority', p)} />
            <DatePicker label="آخر موعد تحتاجه فيه" value={draft.neededBy} onChange={v => set('neededBy', v)} min={today} max={lastAllowedDay(today)} error={errors.neededBy} />
          </Section>

          <Section n={2} title="المستلم">
            <div className="grid grid-cols-2 gap-4">
              <Field label="اسم المستلم" error={errors.receiverName}><Input autoComplete="off" value={draft.receiverName} onChange={e => set('receiverName', e.target.value)} invalid={!!errors.receiverName} /></Field>
              <Field label="جوال المستلم" error={errors.receiverPhone}><Input dir="ltr" inputMode="tel" autoComplete="off" placeholder="05XXXXXXXX" value={draft.receiverPhone} onChange={e => set('receiverPhone', onlyDigits(e.target.value, 10))} invalid={!!errors.receiverPhone} className="text-end tabular-nums" /></Field>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section n={3} title="مكان التسليم">
            <div className="relative h-72 overflow-hidden rounded-control border border-line">
              <LocationMap center={center} value={draft.delivery} onChange={place} />
              <div className="absolute start-3 top-3 z-[500]"><Button variant="outline" className="h-9 shadow-md" loading={locating} onClick={locate}><Crosshair className="size-4" /> موقعي الحالي</Button></div>
            </div>
            <div className="flex items-center gap-2 rounded-control bg-primary-light/60 px-3 py-2 text-xs text-primary-dark">
              <Sparkles className="size-3.5 shrink-0" /> الحي والمدينة يتعبون من مكان الدبوس، وتقدر تعدلهم
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="خط العرض">
                <Input dir="ltr" inputMode="decimal" autoComplete="off" placeholder="21.5433" value={coordValue('lat')} onChange={e => typeCoord('lat', e.target.value)} invalid={!!errors.delivery} className="text-end tabular-nums" />
              </Field>
              <Field label="خط الطول">
                <Input dir="ltr" inputMode="decimal" autoComplete="off" placeholder="39.1728" value={coordValue('lng')} onChange={e => typeCoord('lng', e.target.value)} invalid={!!errors.delivery} className="text-end tabular-nums" />
              </Field>
            </div>
            {errors.delivery && <Alert tone="danger">{errors.delivery}</Alert>}
            {geoFailed && <Alert tone="warning">ما قدرنا نحدد موقعك، اضغط على الخريطة لمكان التسليم</Alert>}
            <div className="grid grid-cols-2 gap-4">
              <Field label="المدينة" error={errors.city}>
                <Select value={draft.city} onChange={e => { touched.current.city = true; set('city', e.target.value) }} invalid={!!errors.city}>
                  <option value="" disabled>اختر</option>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="الحي" error={errors.district}><Input value={draft.district} onChange={e => { touched.current.district = true; set('district', e.target.value) }} invalid={!!errors.district} /></Field>
            </div>
            <Field label="تفاصيل (اختياري)" error={errors.details} hint="مثال: البوابة 3 – الطوارئ">
              <Input value={draft.details} onChange={e => set('details', e.target.value)} invalid={!!errors.details} />
            </Field>
          </Section>
          {loadFailed && <Alert tone="danger">تعذّر تحميل الجمعيات، حاول مرة ثانية</Alert>}
          <Button variant="secondary" className="h-12 w-full text-base" loading={loading} onClick={showCharities}>اعرض الجمعيات المناسبة</Button>
        </div>
      </div>
    </AppShell>
  )
}
