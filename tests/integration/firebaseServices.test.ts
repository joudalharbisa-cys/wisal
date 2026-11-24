import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createFirebaseServices } from '../../src/services/firebaseServices'
import type { Org, OrgWithId } from '../../src/features/orgs/types'

const PROJECT = 'demo-wesal'
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
  await env.clearFirestore()
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
})
afterAll(async () => { await env?.cleanup() })

function next<T>(subscribe: (cb: (v: T) => void) => () => void, until: (v: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), 8000)
    const stop = subscribe(v => {
      if (until(v)) { clearTimeout(timer); stop(); resolve(v) }
    })
  })
}

it('applicant registers, admin approves, applicant sees approved', async () => {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com` }, 'integration')
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const s = createFirebaseServices({ auth, db })

  const applicant = await s.auth.signUp('applicant@test.sa', 'password123')
  await s.orgs.submitApplication(applicant, { role: 'charity', name: 'جمعية الشمال', city: 'جدة', district: 'النعيم', licenseNo: '4521', workingHours: 'الأحد-الخميس', canDeliver: false }, 'سارة العتيبي')
  const pending = await next<Org | null>(cb => s.orgs.watchOrg(applicant.uid, cb), o => o?.status === 'pending')
  expect(pending?.contract.version).toBe('1.0-draft')
  expect(pending?.createdAt).toBeInstanceOf(Date)

  await s.auth.signOut()
  const admin = await s.auth.signUp('admin@test.sa', 'password123')
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(`admins/${admin.uid}`).set({ name: 'مدير وصال' }) })
  expect(await s.admin.isAdmin(admin.uid)).toBe(true)
  const list = await next<OrgWithId[]>(cb => s.admin.watchPending(cb), l => l.length === 1)
  expect(list[0].id).toBe(applicant.uid)
  await s.admin.approve(applicant.uid, admin.uid)

  await s.auth.signOut()
  await s.auth.signIn('applicant@test.sa', 'password123')
  expect(await s.admin.isAdmin(applicant.uid)).toBe(false)
  const approved = await next<Org | null>(cb => s.orgs.watchOrg(applicant.uid, cb), o => o?.status === 'approved')
  expect(approved?.reviewedBy).toBe(admin.uid)
}, 30000)
