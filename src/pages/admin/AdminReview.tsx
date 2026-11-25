import { useEffect, useRef, useState } from 'react'
import { Building2, HandHeart, Inbox } from 'lucide-react'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import LtrText from '../../components/ui/LtrText'
import { errorMessage } from '../../features/auth/errors'
import type { OrgWithId } from '../../features/orgs/types'
import AppShell from '../../layout/AppShell'
import { useServices } from '../../services/ServicesContext'
import { useCurrentSession } from '../../session/Guard'

const dateFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' })
const card = 'rounded-card bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

function ApplicationCard({ org, adminUid }: { org: OrgWithId; adminUid: string }) {
  const { admin } = useServices()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const sending = useRef(false)
  const isHospital = org.role === 'hospital'
  const Icon = isHospital ? Building2 : HandHeart

  async function decide(kind: 'approve' | 'reject') {
    if (sending.current) return
    if (kind === 'reject' && reason.trim().length < 3) {
      setReasonError('اكتب سبب الرفض')
      return
    }
    sending.current = true
    setBusy(kind)
    setFailure('')
    try {
      if (kind === 'approve') await admin.approve(org.id, adminUid)
      else await admin.reject(org.id, adminUid, reason.trim())
      // The pending list updates and this card disappears.
    } catch (err) {
      setFailure(errorMessage(err))
      sending.current = false
      setBusy(null)
    }
  }

  const details: [string, React.ReactNode][] = [
    ['المدينة والحي', `${org.city} · ${org.district}`],
    ['رقم الترخيص', <LtrText>{org.licenseNo}</LtrText>],
    isHospital
      ? ['نوع المستشفى', org.hospitalType === 'private' ? 'خاص' : 'حكومي']
      : ['أوقات العمل والتوصيل', `${org.workingHours} · ${org.canDeliver ? 'عندها توصيل' : 'بدون توصيل'}`],
    ['البريد', <LtrText>{org.contactEmail}</LtrText>],
    ['العقد', `${org.contract.acceptedByName} · v${org.contract.version}`],
    ['تاريخ الإرسال', dateFmt.format(org.createdAt)],
  ]

  return (
    <article aria-label={org.name} className={`${card} p-5`}>
      <div className="flex flex-wrap items-start gap-4">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${isHospital ? 'bg-hospital/10 text-hospital' : 'bg-charity/10 text-charity'}`}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{org.name}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${isHospital ? 'bg-hospital/10 text-hospital ring-hospital/20' : 'bg-charity/10 text-charity ring-charity/20'}`}>{isHospital ? 'مستشفى' : 'جمعية'}</span>
            {org.rejectReason && <span className="text-xs text-muted">أعيد إرساله بعد رفض: {org.rejectReason}</span>}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="text-muted">{k}:</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>
        {!rejecting && (
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setRejecting(true)} disabled={!!busy}>رفض</Button>
            <Button onClick={() => decide('approve')} loading={busy === 'approve'}>قبول</Button>
          </div>
        )}
      </div>
      {failure && <div className="mt-4"><Alert tone="danger">{failure}</Alert></div>}
      {rejecting && (
        <div className="mt-4 rounded-control border border-urgent/20 bg-urgent/5 p-4">
          <label htmlFor={`reason-${org.id}`} className="mb-1.5 block text-sm font-medium">سبب الرفض</label>
          <textarea
            id={`reason-${org.id}`}
            rows={2}
            value={reason}
            aria-invalid={!!reasonError || undefined}
            onChange={e => { setReason(e.target.value); setReasonError('') }}
            className="w-full rounded-control border border-line bg-white p-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-light"
            placeholder="مثال: رقم الترخيص غير مطابق"
          />
          {reasonError && <span role="alert" className="mt-1 block text-xs text-urgent">{reasonError}</span>}
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={() => decide('reject')} loading={busy === 'reject'}>تأكيد الرفض</Button>
            <Button variant="outline" onClick={() => { setRejecting(false); setReasonError('') }} disabled={!!busy}>إلغاء</Button>
          </div>
        </div>
      )}
    </article>
  )
}

export default function AdminReview() {
  const { admin } = useServices()
  const session = useCurrentSession()
  const [list, setList] = useState<OrgWithId[] | null>(null)

  useEffect(() => admin.watchPending(setList), [admin])

  if (session.kind !== 'admin') return null
  return (
    <AppShell title="طلبات التسجيل" sub={list ? `${list.length} طلب بانتظار المراجعة` : 'جاري التحميل…'}>
      {list && list.length === 0 && (
        <section className={`${card} p-10 text-center`}>
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-light text-primary"><Inbox className="size-7" /></span>
          <p className="mt-4 text-muted">ما فيه طلبات جديدة</p>
        </section>
      )}
      <div className="space-y-4">
        {list?.map(o => <ApplicationCard key={o.id} org={o} adminUid={session.user.uid} />)}
      </div>
    </AppShell>
  )
}
