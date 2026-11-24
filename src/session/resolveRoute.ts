import type { Org } from '../features/orgs/types'
import type { AuthUser } from '../services/types'

export type Session =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'admin'; user: AuthUser }
  | { kind: 'member'; user: AuthUser; org: Org | null }
  | { kind: 'error' }

export type RouteDecision = { redirect: string } | { allow: true } | { wait: true } | { error: true }

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

/** Where may this session be? Pure, so every case is covered by a table test. */
export function resolveRoute(s: Session, path: string): RouteDecision {
  if (under(path, '/identity')) return { allow: true }
  if (s.kind === 'loading') return { wait: true }
  if (s.kind === 'error') return { error: true }

  const only = (home: string, ...allowed: string[]): RouteDecision =>
    [home, ...allowed].some(p => under(path, p)) ? { allow: true } : { redirect: home }

  if (s.kind === 'anonymous') return only('/login', '/register')
  if (s.kind === 'admin') return only('/admin')
  if (!s.org) return only('/register')
  if (s.org.status === 'approved') return only('/app')
  return only('/pending')
}
