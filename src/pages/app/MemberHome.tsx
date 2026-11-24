import { Inbox, PackageOpen } from 'lucide-react'
import AppShell from '../../layout/AppShell'
import { useCurrentSession } from '../../session/Guard'

function EmptyState({ icon: Icon, text }: { icon: typeof Inbox; text: string }) {
  return (
    <section className="rounded-card bg-white p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-light text-primary"><Icon className="size-7" /></span>
      <p className="mt-4 text-muted">{text}</p>
    </section>
  )
}

/** Approved org home. Requests and stock arrive in phases 2–3; for now a clear empty state per role. */
export default function MemberHome() {
  const session = useCurrentSession()
  if (session.kind !== 'member' || !session.org) return null
  const { org } = session
  return (
    <AppShell title={`أهلًا، ${org.name}`} sub={`${org.city} · ${org.role === 'hospital' ? 'مستشفى' : 'جمعية'}`}>
      {org.role === 'hospital' ? (
        <EmptyState icon={PackageOpen} text="ما عندك طلبات للحين. الطلبات تبدأ في المرحلة الجاية." />
      ) : (
        <EmptyState icon={Inbox} text="ما فيه طلبات واردة للحين." />
      )}
    </AppShell>
  )
}
