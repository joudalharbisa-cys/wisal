import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { toServiceError } from '../features/auth/errors'
import { CONTRACT } from '../features/orgs/contract'
import type { Org } from '../features/orgs/types'
import { getAuthClient, getDb } from '../lib/firebase'
import { applicationFields, type Services } from './types'

const toDate = (v: unknown) => (v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : (v as Date))

function toOrg(d: DocumentData): Org {
  return {
    ...d,
    contract: { ...d.contract, acceptedAt: toDate(d.contract?.acceptedAt) },
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    reviewedAt: d.reviewedAt ? toDate(d.reviewedAt) : undefined,
  } as Org
}

async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    throw toServiceError(e)
  }
}

/** Real backend. Instances are injectable so integration tests can point at the emulators. */
export function createFirebaseServices(deps: { auth?: Auth; db?: Firestore } = {}): Services {
  const auth = () => deps.auth ?? getAuthClient()
  const db = () => deps.db ?? getDb()
  const snap = { serverTimestamps: 'estimate' } as const

  return {
    auth: {
      onUserChanged(cb) {
        return onAuthStateChanged(auth(), u => cb(u ? { uid: u.uid, email: u.email ?? '' } : null))
      },
      async signIn(email, password) {
        await wrap(signInWithEmailAndPassword(auth(), email.trim(), password))
      },
      async signUp(email, password) {
        const cred = await wrap(createUserWithEmailAndPassword(auth(), email.trim(), password))
        return { uid: cred.user.uid, email: cred.user.email ?? email.trim() }
      },
      async signOut() {
        await wrap(signOut(auth()))
      },
    },
    orgs: {
      watchOrg(uid, cb) {
        return onSnapshot(
          doc(db(), 'orgs', uid),
          s => cb(s.exists() ? toOrg(s.data(snap)) : null),
          () => cb(null),
        )
      },
      async submitApplication(user, app, acceptedByName) {
        await wrap(
          setDoc(doc(db(), 'orgs', user.uid), {
            ...applicationFields(app),
            status: 'pending',
            contactEmail: user.email,
            contract: { version: CONTRACT.version, acceptedAt: serverTimestamp(), acceptedByName: acceptedByName.trim() },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        )
      },
      async resubmit(uid, app) {
        // role is fixed at creation; the rules reject changing it.
        const fields: Record<string, unknown> = { ...applicationFields(app) }
        delete fields.role
        await wrap(updateDoc(doc(db(), 'orgs', uid), { ...fields, status: 'pending', updatedAt: serverTimestamp() }))
      },
    },
    admin: {
      async isAdmin(uid) {
        try {
          return (await getDoc(doc(db(), 'admins', uid))).exists()
        } catch {
          return false
        }
      },
      watchPending(cb) {
        // Equality filter only (no orderBy) so no composite index is needed; sort on the client.
        return onSnapshot(query(collection(db(), 'orgs'), where('status', '==', 'pending')), s =>
          cb(
            s.docs
              .map(d => ({ ...toOrg(d.data(snap)), id: d.id }))
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
          ),
        )
      },
      async approve(orgId, adminUid) {
        await wrap(
          updateDoc(doc(db(), 'orgs', orgId), {
            status: 'approved',
            reviewedBy: adminUid,
            reviewedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        )
      },
      async reject(orgId, adminUid, reason) {
        await wrap(
          updateDoc(doc(db(), 'orgs', orgId), {
            status: 'rejected',
            rejectReason: reason.trim(),
            reviewedBy: adminUid,
            reviewedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        )
      },
    },
  }
}
