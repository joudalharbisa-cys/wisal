import { useRef, useState } from 'react'
import { Check, Clock, FilePenLine, Hourglass } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import LtrText from '../../components/ui/LtrText'
import { errorMessage } from '../../features/auth/errors'
import { draftFromOrg, toApplication, type Draft } from '../../features/orgs/application'
import type { Org } from '../../features/orgs/types'
import { validateApplication, type ApplicationErrors } from '../../features/orgs/validate'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'
import DetailsStep from './DetailsStep'

const dateFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { dateStyle: 'long' })

function Summary({ org }: { org: Org }) {
  const rows: [string, React.ReactNode][] = [
    ['اسم الجهة', org.name],
    ['النوع', org.role === 'hospital' ? `مستشفى ${org.hospitalType === 'private' ? 'خاص' : 'حكومي'}` : 'جمعية'],
    ['المدينة والحي', `${org.city} · ${org.district}`],
    ['رقم الترخيص', <LtrText>{org.licenseNo}</LtrText>],
    ['تاريخ الإرسال', dateFmt.format(org.createdAt)],
  ]
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <dt className="text-muted">{k}</dt>
          <dd className="text-end font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Progress({ rejected }: { rejected: boolean }) {
  const steps = [
    { label: 'إرسال الطلب', state: 'done' },
    { label: rejected ? 'يحتاج تعديل' : 'مراجعة إدارة وصال', state: rejected ? 'warn' : 'now' },
    { label: 'الدخول للمنصة', state: 'next' },
  ]
  return (
    <ol className="space-y-4">
      {steps.map(s => (
        <li key={s.label} className="flex items-center gap-3 text-sm">
          <span className={`grid size-8 place-items-center rounded-full ${s.state === 'done' ? 'bg-primary text-white' : s.state === 'now' ? 'bg-accent-light text-accent ring-2 ring-accent/40' : s.state === 'warn' ? 'bg-urgent/10 text-urgent' : 'bg-surface text-muted ring-1 ring-line'}`}>
            {s.state === 'done' ? <Check className="size-4" /> : s.state === 'now' ? <Clock className="size-4" /> : s.state === 'warn' ? <FilePenLine className="size-4" /> : <Hourglass className="size-4" />}
          </span>
          <span className={s.state === 'next' ? 'text-muted' : 'font-medium'}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

export default function Pending() {
  const services = useServices()
  const session = useCurrentSession()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [errors, setErrors] = useState<ApplicationErrors>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  if (session.kind !== 'member' || !session.org) return null
  const { org, user } = session
  const rejected = org.status === 'rejected'

  function startEdit() {
    setDraft(draftFromOrg(org))
    setErrors({})
    setFailure('')
    setEditing(true)
  }

  async function resubmit() {
    if (sending.current) return
    const e = validateApplication(draft)
    setErrors(e)
    if (Object.keys(e).length) return
    sending.current = true
    setBusy(true)
    try {
      await services.orgs.resubmit(user.uid, toApplication(draft))
      setEditing(false)
    } catch (err) {
      setFailure(errorMessage(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <AppShell
      title={rejected ? 'طلبك يحتاج تعديل' : 'طلبك قيد المراجعة'}
      sub={rejected ? 'عدّل البيانات المطلوبة وأعد إرسال الطلب.' : 'إدارة وصال تراجع بياناتك، وتوصلك النتيجة هنا.'}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {rejected && !editing && (
            <Alert tone="danger">
              <div className="font-bold">تم رفض الطلب</div>
              <div className="mt-1">السبب: {org.rejectReason}</div>
            </Alert>
          )}
          {editing ? (
            <Card title="تعديل بيانات الجهة">
              {failure && <div className="mb-4"><Alert tone="danger">{failure}</Alert></div>}
              <DetailsStep value={draft} onChange={p => setDraft(d => ({ ...d, ...p }))} errors={errors} />
              <div className="mt-6 flex gap-3 border-t border-line pt-5">
                <Button onClick={resubmit} loading={busy}>إعادة الإرسال</Button>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>إلغاء</Button>
              </div>
            </Card>
          ) : (
            <Card title="بيانات الطلب" action={rejected ? <Button variant="outline" onClick={startEdit}>تعديل وإعادة الإرسال</Button> : undefined}>
              <Summary org={org} />
            </Card>
          )}
        </div>
        <Card title="المراحل"><Progress rejected={rejected} /></Card>
      </div>
    </AppShell>
  )
}
