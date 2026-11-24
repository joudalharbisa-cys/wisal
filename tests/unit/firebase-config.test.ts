import { it, expect } from 'vitest'
import { getFirebaseConfig, MissingConfigError } from '../../src/lib/firebase'

const full = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'd',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_APP_ID: 'a',
}

it('maps env vars to Firebase options', () => {
  expect(getFirebaseConfig(full)).toEqual({ apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' })
})

it('reports exactly the missing or empty keys', () => {
  let err: unknown
  try { getFirebaseConfig({ ...full, VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: undefined }) } catch (e) { err = e }
  expect(err).toBeInstanceOf(MissingConfigError)
  expect((err as MissingConfigError).missing).toEqual(['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'])
})
