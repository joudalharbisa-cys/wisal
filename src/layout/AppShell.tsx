import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Building2, HandHeart, LogOut, ShieldCheck } from 'lucide-react'
import BrandBand from '../components/brand/BrandBand'
import LogoMark from '../components/brand/LogoMark'
import { useServices } from '../services/ServicesContext'
import { useCurrentSession } from '../session/Guard'

type NavItem = { to: string; label: string; end?: boolean }

/** Signed-in frame (approved identity, style B): brand band, top nav, white cards floating over the band. */
export default function AppShell({ title, sub, action, tall = false, children }: { title: string; sub?: ReactNode; action?: ReactNode; tall?: boolean; children: ReactNode }) {
  const { auth } = useServices()
  const session = useCurrentSession()

  let who = { label: '', icon: Building2 }
  let nav: NavItem[] = []
  if (session.kind === 'admin') {
    who = { label: 'إدارة وصال', icon: ShieldCheck }
    nav = [{ to: '/admin', label: 'طلبات التسجيل' }]
  } else if (session.kind === 'member' && session.org) {
    who = { label: session.org.name, icon: session.org.role === 'charity' ? HandHeart : Building2 }
    if (session.org.status === 'approved') nav = [{ to: '/app', label: 'مخزوني', end: true }, { to: '/app/network', label: 'مخزون الجهات' }]
  }
  const WhoIcon = who.icon

  return (
    <div className="relative min-h-screen bg-surface">
      <BrandBand tall={tall} />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex min-h-20 flex-wrap items-center gap-x-8 gap-y-2 py-3 text-white">
          <div className="flex items-center gap-2.5"><LogoMark /><span className="text-lg font-bold">وصال</span></div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map(n => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `rounded-full px-3.5 py-1.5 transition ${isActive ? 'bg-white/15 font-medium' : 'text-white/70 hover:text-white'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3">
            {who.label && (
              <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm">
                <WhoIcon className="size-4 text-accent-light" /> {who.label}
              </span>
            )}
            <button type="button" onClick={() => auth.signOut()} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" /> تسجيل الخروج
            </button>
          </div>
        </header>
        <main className="pb-14 pt-6 sm:pt-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 text-white">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              {sub && <div className="mt-2 text-white/70">{sub}</div>}
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
