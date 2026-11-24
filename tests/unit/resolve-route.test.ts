import { it, expect } from 'vitest'
import { resolveRoute, type Session } from '../../src/session/resolveRoute'
import type { Org } from '../../src/features/orgs/types'

const user = { uid: 'u1', email: 'h@test.sa' }
const org = (status: Org['status']) => ({ status } as Org)

const loading: Session = { kind: 'loading' }
const anon: Session = { kind: 'anonymous' }
const admin: Session = { kind: 'admin', user }
const noOrg: Session = { kind: 'member', user, org: null }
const pending: Session = { kind: 'member', user, org: org('pending') }
const rejected: Session = { kind: 'member', user, org: org('rejected') }
const approved: Session = { kind: 'member', user, org: org('approved') }

it.each([
  [loading, '/app', { wait: true }],
  [anon, '/login', { allow: true }],
  [anon, '/register', { allow: true }],
  [anon, '/app', { redirect: '/login' }],
  [anon, '/', { redirect: '/login' }],
  [admin, '/admin', { allow: true }],
  [admin, '/app', { redirect: '/admin' }],
  [admin, '/login', { redirect: '/admin' }],
  [noOrg, '/register', { allow: true }],
  [noOrg, '/app', { redirect: '/register' }],
  [noOrg, '/pending', { redirect: '/register' }],
  [pending, '/pending', { allow: true }],
  [pending, '/app', { redirect: '/pending' }],
  [pending, '/register', { redirect: '/pending' }],
  [rejected, '/pending', { allow: true }],
  [rejected, '/register', { redirect: '/pending' }],
  [approved, '/app', { allow: true }],
  [approved, '/app/settings', { allow: true }],
  [approved, '/login', { redirect: '/app' }],
  [approved, '/admin', { redirect: '/app' }],
  [anon, '/identity', { allow: true }],
  [approved, '/identity', { allow: true }],
] as const)('%o at %s', (session, path, expected) => {
  expect(resolveRoute(session as Session, path)).toEqual(expected)
})
