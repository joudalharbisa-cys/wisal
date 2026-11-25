import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import LogoMark from '../../components/brand/LogoMark'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Input from '../../components/ui/Input'
import { errorMessage } from '../../features/auth/errors'
import AuthLayout from '../../layout/AuthLayout'
import { useServices } from '../../services/ServicesContext'

export default function Login() {
  const { auth } = useServices()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const next = {
      email: email.trim() ? undefined : 'اكتب البريد الإلكتروني',
      password: password ? undefined : 'اكتب كلمة المرور',
    }
    setErrors(next)
    setFailure('')
    if (next.email || next.password) return
    setBusy(true)
    try {
      await auth.signIn(email, password)
      // The Guard moves the user to the right page once the session updates.
    } catch (err) {
      setFailure(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <form noValidate onSubmit={submit}>
        <LogoMark className="size-11" />
        <h1 className="mt-8 text-2xl font-bold tracking-tight">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted">ادخل بحساب المستشفى أو الجمعية</p>
        <div className="mt-8 space-y-4">
          {failure && <Alert tone="danger">{failure}</Alert>}
          <Field label="البريد الإلكتروني" error={errors.email}>
            <Input type="email" dir="ltr" autoComplete="email" value={email} invalid={!!errors.email} onChange={e => setEmail(e.target.value)} />
          </Field>
          <Field label="كلمة المرور" error={errors.password}>
            <Input type="password" dir="ltr" autoComplete="current-password" value={password} invalid={!!errors.password} onChange={e => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>دخول</Button>
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          جهة جديدة؟ <Link to="/register" className="font-medium text-primary hover:underline">سجّل مستشفى أو جمعية</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
