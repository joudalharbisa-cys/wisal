import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
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
  if ('redirect' in decision) return <Navigate to={decision.redirect} replace />
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>
}
