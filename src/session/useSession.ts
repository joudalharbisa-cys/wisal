import { useEffect, useState } from 'react'
import { useServices } from '../services/ServicesContext'
import type { Session } from './resolveRoute'

/** Auth user → admin check → own org, kept live. */
export function useSession(): Session {
  const services = useServices()
  const [session, setSession] = useState<Session>({ kind: 'loading' })

  useEffect(() => {
    let stopOrg: (() => void) | undefined
    let alive = true
    const stopUser = services.auth.onUserChanged(async user => {
      stopOrg?.()
      stopOrg = undefined
      if (!user) {
        setSession({ kind: 'anonymous' })
        return
      }
      setSession({ kind: 'loading' })
      let admin: boolean
      try {
        admin = await services.admin.isAdmin(user.uid)
      } catch {
        if (alive) setSession({ kind: 'error' })
        return
      }
      if (!alive) return
      if (admin) {
        setSession({ kind: 'admin', user })
        return
      }
      stopOrg = services.orgs.watchOrg(
        user.uid,
        org => alive && setSession({ kind: 'member', user, org }),
        () => alive && setSession({ kind: 'error' }),
      )
    })
    return () => {
      alive = false
      stopOrg?.()
      stopUser()
    }
  }, [services])

  return session
}
