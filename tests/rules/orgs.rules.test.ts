import { readFileSync } from 'node:fs'
import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment
const ts = () => firebase.firestore.FieldValue.serverTimestamp()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wesal',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

const user = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@test.sa` }).firestore()

function application(uid: string, over: Record<string, unknown> = {}) {
  return {
    role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov',
    status: 'pending', contactEmail: `${uid}@test.sa`,
    contract: { version: '1.0-draft', acceptedAt: ts(), acceptedByName: 'أحمد الغامدي' },
    createdAt: ts(), updatedAt: ts(),
    ...over,
  }
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(path).set(data) })
}

const stored = (status: string, extra: Record<string, unknown> = {}) => ({
  role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov',
  status, contactEmail: 'u1@test.sa',
  contract: { version: '1.0-draft', acceptedAt: new Date(), acceptedByName: 'أحمد' },
  createdAt: new Date(), updatedAt: new Date(), ...extra,
})

describe('applicant create', () => {
  it('applicant can create own pending org', async () => {
    await assertSucceeds(user('u1').doc('orgs/u1').set(application('u1')))
  })
  it('applicant cannot create org for another uid', async () => {
    await assertFails(user('u1').doc('orgs/u2').set(application('u2')))
  })
  it('applicant cannot create with status approved', async () => {
    await assertFails(user('u1').doc('orgs/u1').set(application('u1', { status: 'approved' })))
  })
  it('applicant cannot create with extra field', async () => {
    await assertFails(user('u1').doc('orgs/u1').set(application('u1', { isVerified: true })))
  })
  it('applicant cannot use someone else email', async () => {
    await assertFails(user('u1').doc('orgs/u1').set(application('u1', { contactEmail: 'x@test.sa' })))
  })
  it('applicant cannot create an unknown role', async () => {
    await assertFails(user('u1').doc('orgs/u1').set(application('u1', { role: 'admin' })))
  })
})

describe('reading', () => {
  it('owner can read own org, other user cannot', async () => {
    await seed('orgs/u1', stored('pending'))
    await assertSucceeds(user('u1').doc('orgs/u1').get())
    await assertFails(user('u2').doc('orgs/u1').get())
  })
  it('admin can list orgs, non-admin cannot', async () => {
    await seed('admins/a1', { name: 'مدير' })
    await seed('orgs/u1', stored('pending'))
    await assertSucceeds(user('a1').collection('orgs').where('status', '==', 'pending').get())
    await assertFails(user('u2').collection('orgs').where('status', '==', 'pending').get())
  })
})

describe('owner updates', () => {
  it('applicant cannot approve self', async () => {
    await seed('orgs/u1', stored('pending'))
    await assertFails(user('u1').doc('orgs/u1').update({ status: 'approved', updatedAt: ts() }))
  })
  it('rejected owner can resubmit without touching rejectReason', async () => {
    await seed('orgs/u1', stored('rejected', { rejectReason: 'الترخيص منتهي' }))
    await assertSucceeds(user('u1').doc('orgs/u1').update({ status: 'pending', name: 'مستشفى الملك فهد العام', updatedAt: ts() }))
  })
  it('rejected owner cannot clear rejectReason while resubmitting', async () => {
    await seed('orgs/u1', stored('rejected', { rejectReason: 'الترخيص منتهي' }))
    await assertFails(user('u1').doc('orgs/u1').update({ status: 'pending', rejectReason: firebase.firestore.FieldValue.delete(), updatedAt: ts() }))
  })
  it('pending owner cannot edit', async () => {
    await seed('orgs/u1', stored('pending'))
    await assertFails(user('u1').doc('orgs/u1').update({ name: 'اسم ثاني', updatedAt: ts() }))
  })
})

describe('admin review', () => {
  beforeEach(async () => {
    await seed('admins/a1', { name: 'مدير' })
    await seed('orgs/u1', stored('pending'))
  })
  it('admin can approve', async () => {
    await assertSucceeds(user('a1').doc('orgs/u1').update({ status: 'approved', reviewedBy: 'a1', reviewedAt: ts(), updatedAt: ts() }))
  })
  it('admin reject without reason fails', async () => {
    await assertFails(user('a1').doc('orgs/u1').update({ status: 'rejected', reviewedBy: 'a1', reviewedAt: ts(), updatedAt: ts() }))
  })
  it('admin reject with short reason fails', async () => {
    await assertFails(user('a1').doc('orgs/u1').update({ status: 'rejected', rejectReason: 'لا', reviewedBy: 'a1', reviewedAt: ts(), updatedAt: ts() }))
  })
  it('admin reject with reason succeeds', async () => {
    await assertSucceeds(user('a1').doc('orgs/u1').update({ status: 'rejected', rejectReason: 'الترخيص منتهي', reviewedBy: 'a1', reviewedAt: ts(), updatedAt: ts() }))
  })
  it('admin cannot impersonate another reviewer', async () => {
    await assertFails(user('a1').doc('orgs/u1').update({ status: 'approved', reviewedBy: 'someone', reviewedAt: ts(), updatedAt: ts() }))
  })
  it('admin cannot change org data', async () => {
    await assertFails(user('a1').doc('orgs/u1').update({ name: 'اسم ثاني', updatedAt: ts() }))
  })
  it('non-admin cannot approve someone else', async () => {
    await assertFails(user('u2').doc('orgs/u1').update({ status: 'approved', reviewedBy: 'u2', reviewedAt: ts(), updatedAt: ts() }))
  })
})

describe('admins and deletes', () => {
  it('nobody can write admins', async () => {
    await assertFails(user('u1').doc('admins/u1').set({ name: 'أنا' }))
  })
  it('user can read own admins doc only', async () => {
    await seed('admins/a1', { name: 'مدير' })
    await assertSucceeds(user('a1').doc('admins/a1').get())
    await assertFails(user('u1').doc('admins/a1').get())
  })
  it('nobody can delete orgs', async () => {
    await seed('admins/a1', { name: 'مدير' })
    await seed('orgs/u1', stored('pending'))
    await assertFails(user('u1').doc('orgs/u1').delete())
    await assertFails(user('a1').doc('orgs/u1').delete())
  })
})
