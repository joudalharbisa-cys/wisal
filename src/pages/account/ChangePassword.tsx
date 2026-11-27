import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import { errorMessage } from '../../features/auth/errors'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { ServiceError } from '../../services/types'

type Errors = Partial<Record<'current' | 'next' | 'confirm', string>>

/** Any signed-in account changes its own password: the current one, then the new one twice. */
export default function ChangePassword() {
  const { auth } = useServices()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found: Errors = {}
    if (!current) found.current = 'اكتب كلمة المرور الحالية'
    if (next.length < 8) found.next = 'كلمة المرور لازم تكون 8 أحرف على الأقل'
    else if (next === current) found.next = 'اختر كلمة مرور غير الحالية'
    if (!found.next && confirm !== next) found.confirm = 'الكلمتين مو متطابقتين'
    setErrors(found)
    setFailure(null)
    setDone(false)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await auth.changePassword(current, next)
      setDone(true)
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'wrong-credentials') setErrors({ current: 'كلمة المرور الحالية غلط' })
      else setFailure(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell title="تغيير كلمة المرور" sub="لحسابك اللي داخل فيه الحين">
      <form noValidate onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-card border border-line bg-white p-6 shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-light text-accent" aria-hidden><KeyRound className="size-6" /></span>
        <Field label="كلمة المرور الحالية" error={errors.current}>
          <Input type="password" autoComplete="current-password" dir="ltr" value={current} onChange={e => setCurrent(e.target.value)} invalid={!!errors.current} />
        </Field>
        <Field label="كلمة المرور الجديدة" hint="8 أحرف على الأقل" error={errors.next}>
          <Input type="password" autoComplete="new-password" dir="ltr" value={next} onChange={e => setNext(e.target.value)} invalid={!!errors.next} />
        </Field>
        <Field label="أعد كتابة كلمة المرور الجديدة" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={e => setConfirm(e.target.value)} invalid={!!errors.confirm} />
        </Field>
        {failure && <Alert tone="danger">{failure}</Alert>}
        {done && <Alert tone="success">تغيّرت كلمة المرور</Alert>}
        <Button type="submit" className="h-11 w-full" loading={busy}>غيّر كلمة المرور</Button>
      </form>
    </AppShell>
  )
}
