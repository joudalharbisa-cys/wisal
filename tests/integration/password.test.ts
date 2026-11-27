import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { beforeAll, describe, expect, it } from 'vitest'
import { createFirebaseServices } from '../../src/services/firebaseServices'

const PROJECT = 'demo-wesal'
function services(name: string) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: `${PROJECT}.firebaseapp.com` }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  return createFirebaseServices({ auth, db })
}

beforeAll(async () => {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
})

describe('change password on the emulator', () => {
  it('needs the current password; afterwards only the new one signs in', async () => {
    const s = services('pw-a')
    await s.auth.signUp('pw@test.sa', 'old-password-1')
    await expect(s.auth.changePassword('not-it-at-all', 'new-password-1')).rejects.toMatchObject({ code: 'wrong-credentials' })
    await s.auth.changePassword('old-password-1', 'new-password-1')
    await s.auth.signOut()
    const other = services('pw-b')
    await expect(other.auth.signIn('pw@test.sa', 'old-password-1')).rejects.toMatchObject({ code: 'wrong-credentials' })
    await other.auth.signIn('pw@test.sa', 'new-password-1')
  }, 30000)
})
