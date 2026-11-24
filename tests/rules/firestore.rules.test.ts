import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, it } from 'vitest'
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wesal',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => { await env?.cleanup() })

it('denies unauthenticated reads', async () => {
  await assertFails(env.unauthenticatedContext().firestore().doc('orgs/x').get())
})

it('denies a signed-in user writing their own org doc', async () => {
  await assertFails(env.authenticatedContext('u1').firestore().doc('orgs/u1').set({ name: 'a' }))
})

it('denies a signed-in user listing requests', async () => {
  await assertFails(env.authenticatedContext('u1').firestore().collection('requests').get())
})
