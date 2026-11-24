import { it, expect } from 'vitest'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError } from '../../src/services/types'
import type { Org, OrgApplication } from '../../src/features/orgs/types'

const app: OrgApplication = { role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov' }

function latest<T>(subscribe: (cb: (v: T) => void) => () => void) {
  const box: { value?: T } = {}
  subscribe(v => { box.value = v })
  return box
}

it('signUp then submitApplication emits a pending org', async () => {
  const s = createFakeServices()
  const user = await s.auth.signUp('h@test.sa', 'password123')
  await s.orgs.submitApplication(user, app, 'أحمد الغامدي')
  const org = latest<Org | null>(cb => s.orgs.watchOrg(user.uid, cb))
  await Promise.resolve()
  expect(org.value?.status).toBe('pending')
  expect(org.value?.contract.acceptedByName).toBe('أحمد الغامدي')
  expect(org.value?.contactEmail).toBe('h@test.sa')
})

it('signIn with a wrong password fails with wrong-credentials', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'password123' }] })
  await expect(s.auth.signIn('h@test.sa', 'nope')).rejects.toMatchObject({ code: 'wrong-credentials' })
  await expect(s.auth.signIn('h@test.sa', 'nope')).rejects.toBeInstanceOf(ServiceError)
})

it('signUp with a used email fails with email-in-use', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'password123' }] })
  await expect(s.auth.signUp('h@test.sa', 'password123')).rejects.toMatchObject({ code: 'email-in-use' })
})

it('reject needs a reason of at least 3 characters', async () => {
  const s = createFakeServices({ admins: ['a1'] })
  const user = await s.auth.signUp('h@test.sa', 'password123')
  await s.orgs.submitApplication(user, app, 'أحمد الغامدي')
  await expect(s.admin.reject(user.uid, 'a1', 'لا')).rejects.toMatchObject({ code: 'invalid-transition' })
})

it('approve flips the org to approved for its watcher', async () => {
  const s = createFakeServices({ admins: ['a1'] })
  const user = await s.auth.signUp('h@test.sa', 'password123')
  await s.orgs.submitApplication(user, app, 'أحمد الغامدي')
  const org = latest<Org | null>(cb => s.orgs.watchOrg(user.uid, cb))
  await s.admin.approve(user.uid, 'a1')
  expect(org.value?.status).toBe('approved')
  expect(org.value?.reviewedBy).toBe('a1')
})

it('resubmit is only allowed from rejected and keeps the reason', async () => {
  const s = createFakeServices({ admins: ['a1'] })
  const user = await s.auth.signUp('h@test.sa', 'password123')
  await s.orgs.submitApplication(user, app, 'أحمد الغامدي')
  await expect(s.orgs.resubmit(user.uid, app)).rejects.toMatchObject({ code: 'invalid-transition' })
  await s.admin.reject(user.uid, 'a1', 'الترخيص منتهي')
  await s.orgs.resubmit(user.uid, { ...app, name: 'مستشفى الملك فهد العام' })
  const org = latest<Org | null>(cb => s.orgs.watchOrg(user.uid, cb))
  await Promise.resolve()
  expect(org.value).toMatchObject({ status: 'pending', name: 'مستشفى الملك فهد العام', rejectReason: 'الترخيص منتهي' })
})

it('admin decisions only apply to pending applications (mirrors the rules)', async () => {
  const s = createFakeServices({ admins: ['a1'] })
  const user = await s.auth.signUp('h@test.sa', 'password123')
  await s.orgs.submitApplication(user, app, 'أحمد الغامدي')
  await s.admin.approve(user.uid, 'a1')
  await expect(s.admin.reject(user.uid, 'a1', 'غيّرنا رأينا')).rejects.toMatchObject({ code: 'invalid-transition' })
  await expect(s.admin.approve(user.uid, 'a1')).rejects.toMatchObject({ code: 'invalid-transition' })
})

it('watchPending lists only pending orgs, oldest first', async () => {
  const s = createFakeServices({ admins: ['a1'] })
  const a = await s.auth.signUp('a@test.sa', 'password123')
  await s.orgs.submitApplication(a, app, 'أحمد الغامدي')
  const b = await s.auth.signUp('b@test.sa', 'password123')
  await s.orgs.submitApplication(b, { ...app, name: 'مستشفى ثاني' }, 'سارة')
  await s.admin.approve(a.uid, 'a1')
  const list = latest<{ id: string }[]>(cb => s.admin.watchPending(cb))
  await Promise.resolve()
  expect(list.value?.map(o => o.id)).toEqual([b.uid])
})
