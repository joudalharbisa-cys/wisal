import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { isValidItemKey, normalizeName, stockId } from '../features/inventory/names'
import { MAX_QTY, type StockRow, type Warehouse } from '../features/inventory/types'
import { validateItemName } from '../features/inventory/validate'
import { toServiceError } from '../features/auth/errors'
import { CONTRACT } from '../features/orgs/contract'
import type { Org } from '../features/orgs/types'
import { getAuthClient, getDb } from '../lib/firebase'
import { applicationFields, resolveItem, ServiceError, type Services } from './types'

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
      watchOrg(uid, cb, onError) {
        return onSnapshot(
          doc(db(), 'orgs', uid),
          { includeMetadataChanges: true },
          s => {
            // An offline cache miss is not proof the org doesn't exist; wait for the server.
            if (!s.exists() && s.metadata.fromCache) return
            cb(s.exists() ? toOrg(s.data(snap)) : null)
          },
          e => onError?.(toServiceError(e)),
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
        // Errors propagate: a failed check must not silently mean "not an admin".
        return (await wrap(getDoc(doc(db(), 'admins', uid)))).exists()
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
    inventory: {
      watchItems(cb, onError) {
        return onSnapshot(
          collection(db(), 'items'),
          s => cb(s.docs.map(d => ({ key: d.id, name: d.data().name as string }))),
          e => onError?.(toServiceError(e)),
        )
      },
      watchWarehouses(uid, cb, onError) {
        return onSnapshot(
          collection(db(), 'orgs', uid, 'warehouses'),
          s => cb(s.docs.map(d => toWarehouse(d.id, d.data(snap))).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
          e => onError?.(toServiceError(e)),
        )
      },
      watchStock(uid, cb, onError) {
        return onSnapshot(
          collection(db(), 'orgs', uid, 'stock'),
          s => cb(s.docs.map(d => toStockRow(d.id, d.data(snap)))),
          e => onError?.(toServiceError(e)),
        )
      },
      async saveWarehouse(owner, id, draft) {
        const fields = { name: draft.name.trim(), city: draft.city, district: draft.district.trim(), location: { lat: draft.location.lat, lng: draft.location.lng } }
        const whs = collection(db(), 'orgs', owner.uid, 'warehouses')
        if (!id) {
          const ref = doc(whs)
          await wrap(setDoc(ref, { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
          return ref.id
        }
        // Keep the warehouse name/city copied onto its rows in step with the warehouse.
        const rows = await wrap(getDocs(query(collection(db(), 'orgs', owner.uid, 'stock'), where('warehouseId', '==', id))))
        const batch = writeBatch(db())
        batch.update(doc(whs, id), { ...fields, updatedAt: serverTimestamp() })
        rows.docs.forEach(r => batch.update(r.ref, { warehouseName: fields.name, city: fields.city, updatedAt: serverTimestamp() }))
        await wrap(batch.commit())
        return id
      },
      async deleteWarehouse(uid, id) {
        const rows = await wrap(getDocs(query(collection(db(), 'orgs', uid, 'stock'), where('warehouseId', '==', id))))
        const batch = writeBatch(db())
        rows.docs.forEach(r => batch.delete(r.ref))
        batch.delete(doc(db(), 'orgs', uid, 'warehouses', id))
        await wrap(batch.commit())
      },
      async setStock(owner, warehouse, choice, condition, qty) {
        const wanted = resolveItem(choice, normalizeName)
        if (!isValidItemKey(wanted.key) || validateItemName(wanted.name) || !Number.isInteger(qty) || qty < 0 || qty > MAX_QTY)
          throw new ServiceError('invalid-transition', 'bad product or quantity')
        const itemRef = doc(db(), 'items', wanted.key)
        const rowRef = doc(db(), 'orgs', owner.uid, 'stock', stockId(warehouse.id, wanted.key, condition))
        await wrap(
          runTransaction(db(), async tx => {
            const [item, row] = [await tx.get(itemRef), await tx.get(rowRef)]
            const itemName = item.exists() ? (item.data().name as string) : wanted.name
            if (!item.exists()) tx.set(itemRef, { name: itemName, key: wanted.key, createdBy: owner.uid, createdAt: serverTimestamp() })
            if (row.exists()) tx.update(rowRef, { qty, updatedAt: serverTimestamp() })
            else
              tx.set(rowRef, {
                orgId: owner.uid, orgName: owner.name, orgRole: owner.role,
                warehouseId: warehouse.id, warehouseName: warehouse.name, city: warehouse.city,
                itemId: wanted.key, itemName, condition, qty, reserved: 0, updatedAt: serverTimestamp(),
              })
          }),
        )
      },
      async deleteStock(uid, id) {
        await wrap(deleteDoc(doc(db(), 'orgs', uid, 'stock', id)))
      },
    },
    requests: {
      watchMine: notYet,
      watchOne: notYet,
      watchCode: notYet,
      loadCandidates: notYet,
      send: notYet,
    },
  }
}

function notYet(): never {
  throw new ServiceError('unknown', 'requests not implemented yet')
}

function toWarehouse(id: string, d: DocumentData): Warehouse {
  return { id, name: d.name, city: d.city, district: d.district, location: { lat: d.location.lat, lng: d.location.lng }, createdAt: toDate(d.createdAt), updatedAt: toDate(d.updatedAt) }
}

function toStockRow(id: string, d: DocumentData): StockRow {
  return { ...(d as Omit<StockRow, 'id' | 'updatedAt'>), id, updatedAt: toDate(d.updatedAt) }
}
