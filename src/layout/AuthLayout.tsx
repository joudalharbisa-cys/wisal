import type { ReactNode } from 'react'
import { Building2, HandHeart, ShieldCheck } from 'lucide-react'

const POINTS = [
  { icon: Building2, t: 'للمستشفيات', d: 'اطلب احتياجك واختر الجمعية الأنسب لك' },
  { icon: HandHeart, t: 'للجمعيات', d: 'شوف الطلبات القريبة منك ووصّلها بسرعة' },
  { icon: ShieldCheck, t: 'تسليم موثّق', d: 'كل طلب يتقفل برمز استلام من المستشفى' },
]

/** Split auth layout: content on one side, brand panel on the other (hidden on small screens). */
export default function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid min-h-screen bg-white ${wide ? 'lg:grid-cols-[3fr_2fr]' : 'lg:grid-cols-2'}`}>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>{children}</div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-bl from-primary to-primary-dark lg:block">
        <svg className="absolute inset-0 size-full opacity-[0.07]" aria-hidden="true">
          <defs><pattern id="auth-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="white" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#auth-grid)" />
        </svg>
        <div className="relative flex h-full flex-col justify-center p-16 text-white">
          <h2 className="max-w-md text-3xl font-bold leading-snug">نربط احتياج المستشفيات بالجمعيات القادرة على تلبيته</h2>
          <p className="mt-3 max-w-md text-white/70">من تسجيل الطلب إلى التسليم الموثّق، في مكان واحد.</p>
          <ul className="mt-12 space-y-6">
            {POINTS.map(({ icon: I, t, d }) => (
              <li key={t} className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-white/10 ring-1 ring-inset ring-white/15"><I className="size-5 text-accent-light" /></span>
                <div><div className="font-medium">{t}</div><div className="text-sm text-white/65">{d}</div></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
