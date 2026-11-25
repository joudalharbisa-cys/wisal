import { useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle2, KeyRound, Lock, PackageCheck, Truck } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { onlyDigits } from '../../lib/digits'
import { useServices } from '../../services/ServicesContext'
import type { OrgRef } from '../inventory/types'
import PersonForm from './PersonForm'
import { RequestStatusBadge } from './RequestStatus'
import { personLine } from './timeline'
import type { HospitalRequest } from './types'
import { triesLeft } from './validate'

const MAX_TRIES = 5
const SAVE_FAILED = 'ما قدرنا نحفظ، حاول مرة ثانية'

type Result = { kind: 'wrong' | 'locked'; remaining: number } | { kind: 'network' } | null

/** Status 5: the charity types the receipt code the hospital's receiver gives it. Five wrong tries lock entry. */
function CodeEntry({ r, me }: { r: HospitalRequest; me: OrgRef }) {
  const { requests } = useServices()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>(null)
  const fails = r.codeFails ?? 0
  // Once the hospital unlocks (codeFails back to 0) earlier wrong/locked answers no longer apply.
  const counted = fails > 0 && result && result.kind !== 'network' ? result : null
  const locked = fails >= MAX_TRIES || counted?.kind === 'locked' || (counted?.kind === 'wrong' && counted.remaining === 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 4 || locked) return
    setBusy(true)
    setResult(null)
    try {
      const res = await requests.submitCode(me, r.id, code)
      if (res.result !== 'ok') { setResult({ kind: res.result, remaining: res.remaining }); setCode('') }
    } catch {
      setResult({ kind: 'network' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form noValidate onSubmit={submit} className="mt-4 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-light text-accent" aria-hidden><KeyRound className="size-6" /></span>
      <p className="mt-2 text-xs text-muted">اطلبه من المستلم في المستشفى</p>
      <label htmlFor="receipt-code" className="sr-only">رمز الاستلام</label>
      <Input id="receipt-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" disabled={locked} value={code} onChange={e => setCode(onlyDigits(e.target.value, 4))}
        className="mx-auto mt-3 h-14 w-48 text-center text-3xl font-bold tracking-[0.4em] tabular-nums" />
      {locked ? (
        <p role="alert" className="mt-3 flex items-center justify-center gap-2 rounded-control bg-urgent/5 px-3 py-2 text-sm text-urgent"><Lock className="size-4" aria-hidden />انقفل إدخال الرمز، تواصل مع المستشفى</p>
      ) : counted?.kind === 'wrong' ? (
        <p role="alert" className="mt-3 rounded-control bg-urgent/5 px-3 py-2 text-sm text-urgent">الرمز غلط، {triesLeft(counted.remaining)}</p>
      ) : result?.kind === 'network' ? (
        <p role="alert" className="mt-3 rounded-control bg-urgent/5 px-3 py-2 text-sm text-urgent">تعذّر الاتصال، حاول مرة ثانية</p>
      ) : null}
      <Button type="submit" variant="secondary" className="mt-4 h-11 w-full" disabled={locked || code.length !== 4} loading={busy}>تحقق</Button>
    </form>
  )
}

const TITLE = (r: HospitalRequest) =>
  r.status === 2 ? 'الطلب مقبول'
    : r.status === 3 ? (r.mode === 'pickup' ? 'تجهيز الطلب' : 'بيانات التوصيل')
      : r.status === 4 ? (r.mode === 'pickup' ? 'استلام من المستودع' : 'في الطريق')
        : r.status === 5 ? 'اكتب رمز الاستلام' : 'الطلب مكتمل'

/** The charity's action card for an accepted request (statuses 2–6). */
export default function CharityActions({ r, me, canDeliver, warehouseName }: { r: HospitalRequest; me: OrgRef; canDeliver: boolean; warehouseName: string }) {
  const { requests } = useServices()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true)
    setError(null)
    try { await fn() } catch { setError(SAVE_FAILED) } finally { setBusy(false) }
  }
  const pickup = r.mode === 'pickup'
  const courier = r.pickup ? personLine('مندوب المستشفى', r.pickup, 'يجي') : 'بانتظار بيانات مندوب المستشفى'
  const note = (icon: ReactNode, text: ReactNode) => (
    <div className="mt-4 flex items-start gap-3 rounded-control bg-surface p-3.5 text-sm"><span className="shrink-0 text-muted" aria-hidden>{icon}</span><p>{text}</p></div>
  )

  let body: ReactNode
  if (r.status === 2) {
    body = <>
      <div className="mt-4 flex items-start gap-3 rounded-control bg-normal/10 p-3.5 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-normal" aria-hidden />
        <p>قبلت الطلب، الكمية محجوزة من {warehouseName}<span className="block text-xs text-muted">لما تبدون تجهيز الطلب اضغط الزر تحت، والمستشفى يشوف كل مرحلة بتاريخها.</span></p>
      </div>
      <Button variant="secondary" className="mt-5 h-11 w-full" loading={busy} onClick={run(() => requests.startPreparing(me, r.id, canDeliver))}><PackageCheck className="size-4" /> بدأنا التجهيز</Button>
    </>
  } else if (r.status === 3 && !pickup) {
    body = <div className="mt-4"><PersonForm labels={{ name: 'اسم السائق', phone: 'جوال السائق', date: 'يوم الوصول المتوقع' }} submit={<><Truck className="size-4" /> طلع للتوصيل</>} onSubmit={p => requests.dispatch(me, r.id, p)} /></div>
  } else if (r.status === 3) {
    body = <>
      {note(<PackageCheck className="size-5" />, <>مندوب المستشفى بيستلم الطلب من {warehouseName}. لما يكون جاهز اضغط «جاهز للاستلام».</>)}
      {r.pickup && note(<Truck className="size-5" />, courier)}
      <Button variant="secondary" className="mt-5 h-11 w-full" loading={busy} onClick={run(() => requests.dispatch(me, r.id, null))}>جاهز للاستلام</Button>
    </>
  } else if (r.status === 4) {
    body = <>
      {note(<Truck className="size-5" />, pickup ? courier : r.driver ? personLine('السائق', r.driver, 'يوصل تقريبًا') : 'السائق في الطريق')}
      <Button variant="secondary" className="mt-5 h-11 w-full" loading={busy} onClick={run(() => requests.markArrived(me, r.id))}>{pickup ? 'وصل مندوب المستشفى' : 'وصل'}</Button>
    </>
  } else if (r.status === 5) {
    body = <CodeEntry r={r} me={me} />
  } else {
    body = (
      <div className="mt-4 flex items-start gap-3 rounded-control bg-normal/10 p-3.5 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-normal" aria-hidden />
        <p><b className="block">تم التحقق — الطلب مكتمل</b><span className="block text-xs text-muted">انخصمت الكمية من مخزون {warehouseName}.</span></p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{TITLE(r)}</h2><RequestStatusBadge status={r.status} open={r.open} mode={r.mode} /></div>
      {body}
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </>
  )
}
