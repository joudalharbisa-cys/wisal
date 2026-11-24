import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

export const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

export class MissingConfigError extends Error {
  missing: string[]
  constructor(missing: string[]) {
    super(`Missing Firebase env: ${missing.join(', ')}`)
    this.name = 'MissingConfigError'
    this.missing = missing
  }
}

export function getFirebaseConfig(env: Record<string, string | undefined>): FirebaseOptions {
  const missing = REQUIRED_ENV.filter(k => !env[k]?.trim())
  if (missing.length) throw new MissingConfigError([...missing])
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
}

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'
let app: FirebaseApp | undefined
let db: Firestore | undefined
let auth: Auth | undefined

function getApp(): FirebaseApp {
  app ??= initializeApp(getFirebaseConfig(import.meta.env))
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getApp())
    if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  return db
}

export function getAuthClient(): Auth {
  if (!auth) {
    auth = getAuth(getApp())
    if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  }
  return auth
}
