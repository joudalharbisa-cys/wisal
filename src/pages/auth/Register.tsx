import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Check, HandHeart } from 'lucide-react'
import LogoMark from '../../components/brand/LogoMark'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import ChoiceGroup from '../../components/ui/ChoiceGroup'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import { errorMessage, toServiceError } from '../../features/auth/errors'
import { CONTRACT } from '../../features/orgs/contract'
import type { OrgApplication, OrgRole } from '../../features/orgs/types'
import { validateApplication, type ApplicationErrors } from '../../features/orgs/validate'
import AuthLayout from '../../layout/AuthLayout'
import { useServices } from '../../services/ServicesContext'
import type { AuthUser } from '../../services/types'
import { useCurrentSession } from '../../session/Guard'
import DetailsStep, { type Draft } from './DetailsStep'

const STEPS = ['نوع الجهة', 'بيانات الجهة', 'عقد التعاون'] as const
type AccountErrors = { email?: string; password?: string; confirm?: string }

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const done = i < step
        const now = i === step
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full font-bold ${done ? 'bg-primary text-white' : now ? 'bg-primary-light text-primary ring-2 ring-primary' : 'bg-surface text-muted ring-1 ring-line'}`}>
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={now ? 'font-bold text-ink' : 'text-muted'}>{label}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? 'bg-primary' : 'bg-line'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

/** Only the fields that belong to the chosen role, trimmed. */
function toApplication(d: Draft): OrgApplication {
  const base = { role: d.role!, name: d.name!.trim(), city: d.city!, district: d.district!.trim(), licenseNo: d.licenseNo!.trim() }
  return d.role === 'hospital'
    ? { ...base, hospitalType: d.hospitalType }
    : { ...base, workingHours: d.workingHours!.trim(), canDeliver: d.canDeliver }
}

export default function Register() {
  const services = useServices()
  const session = useCurrentSession()
  const needsAccount = session.kind === 'anonymous'

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>({})
  const [errors, setErrors] = useState<ApplicationErrors>({})
  const [account, setAccount] = useState({ email: '', password: '', confirm: '' })
  const [accountErrors, setAccountErrors] = useState<AccountErrors>({})
  const [signer, setSigner] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  const patch = (p: Draft) => setDraft(d => ({ ...d, ...p }))

  function nextFromDetails() {
    const e = validateApplication(draft)
    const a: AccountErrors = {}
    if (needsAccount) {
      if (!account.email.trim()) a.email = 'اكتب البريد الإلكتروني'
      if (account.password.length < 8) a.password = 'كلمة المرور لازم تكون 8 أحرف على الأقل'
      if (account.confirm !== account.password) a.confirm = 'كلمتا المرور غير متطابقتين'
    }
    setErrors(e)
    setAccountErrors(a)
    if (Object.keys(e).length === 0 && Object.keys(a).length === 0) {
      setFailure('')
      setStep(2)
    }
  }

  async function submit() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setFailure('')
    try {
      let user: AuthUser
      if (session.kind === 'member') user = session.user
      else user = await services.auth.signUp(account.email, account.password)
      await services.orgs.submitApplication(user, toApplication(draft), signer)
      // The Guard moves the user to /pending once the new org is visible.
    } catch (err) {
      const code = toServiceError(err).code
      setFailure(errorMessage(err))
      if (code === 'email-in-use' || code === 'weak-password') setStep(1)
      submitting.current = false
      setBusy(false)
    }
  }

  const canSubmit = agreed && signer.trim().length >= 3

  return (
    <AuthLayout wide>
      <LogoMark className="size-11" />
      <h1 className="mt-6 text-2xl font-bold tracking-tight">تسجيل جهة جديدة</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        بعد الإرسال تراجع إدارة وصال طلبك. {needsAccount && <>عندك حساب؟ <Link to="/login" className="font-medium text-primary hover:underline">تسجيل الدخول</Link></>}
      </p>
      <Stepper step={step} />
      {failure && <div className="mb-5"><Alert tone="danger">{failure}</Alert></div>}

      {step === 0 && (
        <section className="space-y-6">
          <h2 className="text-lg font-bold">نوع الجهة</h2>
          <ChoiceGroup<OrgRole>
            label="الجهة"
            value={draft.role}
            onChange={role => setDraft(d => ({ ...d, role, hospitalType: undefined, workingHours: undefined, canDeliver: undefined }))}
            options={[
              { value: 'hospital', label: 'مستشفى', hint: 'يطلب احتياجه من الجمعيات', icon: Building2 },
              { value: 'charity', label: 'جمعية', hint: 'تعرض مخزونها وتوصّل الطلبات', icon: HandHeart },
            ]}
          />
          <Button onClick={() => draft.role && setStep(1)} disabled={!draft.role}>التالي</Button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6">
          <h2 className="text-lg font-bold">بيانات الجهة</h2>
          <DetailsStep value={draft} onChange={patch} errors={errors} />
          {needsAccount && (
            <div className="space-y-4 border-t border-line pt-6">
              <h3 className="font-bold">حساب الدخول</h3>
              <Field label="البريد الإلكتروني" error={accountErrors.email}>
                <Input type="email" dir="ltr" autoComplete="email" value={account.email} invalid={!!accountErrors.email} onChange={e => setAccount(a => ({ ...a, email: e.target.value }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="كلمة المرور" hint="8 أحرف على الأقل" error={accountErrors.password}>
                  <Input type="password" dir="ltr" autoComplete="new-password" value={account.password} invalid={!!accountErrors.password} onChange={e => setAccount(a => ({ ...a, password: e.target.value }))} />
                </Field>
                <Field label="تأكيد كلمة المرور" error={accountErrors.confirm}>
                  <Input type="password" dir="ltr" autoComplete="new-password" value={account.confirm} invalid={!!accountErrors.confirm} onChange={e => setAccount(a => ({ ...a, confirm: e.target.value }))} />
                </Field>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={nextFromDetails}>التالي</Button>
            <Button variant="outline" onClick={() => setStep(0)}>رجوع</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6">
          <h2 className="text-lg font-bold">عقد التعاون</h2>
          <div className="max-h-64 overflow-y-auto rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-bold">{CONTRACT.title}</span>
              <span className="text-xs text-muted" dir="ltr">v{CONTRACT.version}</span>
            </div>
            <ol className="list-decimal space-y-2 ps-5 text-sm leading-relaxed">
              {CONTRACT.clauses.map(c => <li key={c}>{c}</li>)}
            </ol>
          </div>
          <Field label="اسم الموقّع" hint="الشخص المفوّض عن الجهة">
            <Input value={signer} onChange={e => setSigner(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            قرأت العقد وأوافق عليه
          </label>
          <div className="flex gap-3">
            <Button onClick={submit} disabled={!canSubmit} loading={busy}>وقّع وأرسل الطلب</Button>
            <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>رجوع</Button>
          </div>
        </section>
      )}
    </AuthLayout>
  )
}
