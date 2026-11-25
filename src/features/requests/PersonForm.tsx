import { useState, type FormEvent, type ReactNode } from 'react'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import { onlyDigits } from '../../lib/digits'
import DateTimeFields from './DateTimeFields'
import { combine, fromDate, nextSlot, type DateTime } from './slots'
import type { Person } from './types'
import { parsePhone } from './validate'

type Labels = { name: string; phone: string; date: string }

/** Name, mobile and expected time of a driver (charity) or courier (hospital). */
export default function PersonForm({ labels, submit, initial, onSubmit }: { labels: Labels; submit: ReactNode; initial?: Person; onSubmit: (p: Person) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [when, setWhen] = useState<DateTime>(() => (initial ? fromDate(initial.eta) : nextSlot(new Date())))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const n = name.trim()
  const errors = {
    name: n.length < 2 || n.length > 60 ? `اكتب ${labels.name}` : undefined,
    phone: parsePhone(phone) ? undefined : 'رقم الجوال لازم يبدأ بـ 05 ويكون 10 أرقام',
    when: combine(when) ? undefined : 'اختر اليوم والساعة',
  }
  const go = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    const eta = combine(when)
    if (errors.name || errors.phone || !eta) return
    setBusy(true)
    setFailed(false)
    try { await onSubmit({ name: n, phone, eta }) } catch { setFailed(true) } finally { setBusy(false) }
  }

  return (
    <form noValidate onSubmit={go} className="space-y-4">
      <Field label={labels.name} error={tried ? errors.name : undefined}>
        <Input maxLength={60} autoComplete="off" value={name} onChange={e => setName(e.target.value)} invalid={tried && !!errors.name} />
      </Field>
      <Field label={labels.phone} error={tried ? errors.phone : undefined}>
        <Input dir="ltr" inputMode="tel" autoComplete="off" placeholder="05XXXXXXXX" value={phone} onChange={e => setPhone(onlyDigits(e.target.value, 10))} invalid={tried && !!errors.phone} className="text-end tabular-nums" />
      </Field>
      <DateTimeFields dateLabel={labels.date} value={when} onChange={setWhen} />
      {tried && errors.when && <Alert tone="danger">{errors.when}</Alert>}
      {failed && <Alert tone="danger">ما قدرنا نحفظ، حاول مرة ثانية</Alert>}
      <Button type="submit" variant="secondary" className="h-11 w-full" loading={busy}>{submit}</Button>
    </form>
  )
}
