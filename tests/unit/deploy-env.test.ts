import { it, expect } from 'vitest'
import { deployEnvProblems } from '../../scripts/deploy-env.mjs'

const real = {
  VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_AUTH_DOMAIN: 'wesal.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'wesal-prod', VITE_FIREBASE_APP_ID: 'a',
}

it('accepts a real production config', () => {
  expect(deployEnvProblems(real)).toEqual([])
})

it('blocks deploys that would point users at the local emulators', () => {
  expect(deployEnvProblems({ ...real, VITE_USE_EMULATORS: 'true' })).toContain('VITE_USE_EMULATORS=true')
})

it('blocks deploys built with a demo project id', () => {
  expect(deployEnvProblems({ ...real, VITE_FIREBASE_PROJECT_ID: 'demo-wesal' })).toContain('demo project id: demo-wesal')
})

it('blocks deploys with missing keys', () => {
  expect(deployEnvProblems({ ...real, VITE_FIREBASE_APP_ID: '' })).toContain('missing: VITE_FIREBASE_APP_ID')
})
