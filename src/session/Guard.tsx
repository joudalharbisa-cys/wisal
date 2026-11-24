import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { resolveRoute, type Session } from './resolveRoute'
import { useSession } from './useSession'

const SessionCtx = createContext<Session>({ kind: 'loading' })

/** Current session for screens inside the Guard. */
export function useCurrentSession(): Session {
  return useContext(SessionCtx)
}

export function Guard({ children }: { children: ReactNode }) {
  const session = useSession()
  const { pathname } = useLocation()
  const decision = resolveRoute(session, pathname)

  if ('wait' in decision)
    return (
      <div className="grid min-h-screen place-items-center text-primary">
        <Spinner className="size-8" />
      </div>
    )
  if ('error' in decision)
    return (
      <div className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="max-w-sm rounded-card bg-white p-8 text-center shadow-sm">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-medium/10 text-medium"><WifiOff className="size-7" /></span>
          <h1 className="mt-4 text-lg font-bold">تعذّر تحميل حسابك</h1>
          <p className="mt-1 text-sm text-muted">تأكد من الاتصال بالإنترنت ثم حاول مرة ثانية.</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>حاول مرة ثانية</Button>
        </div>
      </div>
    )
  if ('redirect' in decision) return <Navigate to={decision.redirect} replace />
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>
}
