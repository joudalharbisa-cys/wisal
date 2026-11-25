import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { isValidItemKey, normalizeName, stockId } from '../features/inventory/names'
import { MAX_QTY, type StockRow, type Warehouse } from '../features/inventory/types'
import { validateItemName } from '../features/inventory/validate'
import { makeReceiptCode } from '../features/requests/code'
import type { HospitalRequest } from '../features/requests/types'
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
      watchMine(uid, cb, onError) {
        return onSnapshot(
          query(collection(db(), 'requests'), where('hospitalId', '==', uid)),
          s => cb(s.docs.map(d => toRequest(d.id, d.data(snap))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
          e => onError?.(toServiceError(e)),
        )
      },
      watchOne(id, cb, onError) {
        return onSnapshot(
          doc(db(), 'requests', id),
          s => cb(s.exists() ? toRequest(s.id, s.data(snap)) : null),
          e => (isDenied(e) ? cb(null) : onError?.(toServiceError(e))),
        )
      },
      watchCode(id, cb, onError) {
        return onSnapshot(
          doc(db(), 'requestSecrets', id),
          s => cb(s.exists() ? (s.data().code as string) : null),
          e => (isDenied(e) ? cb(null) : onError?.(toServiceError(e))),
        )
      },
      watchContact(id, cb, onError) {
        return onSnapshot(
          doc(db(), 'requestContacts', id),
          s => cb(s.exists() ? { name: s.data().name as string, phone: s.data().phone as string } : null),
          e => (isDenied(e) ? cb(null) : onError?.(toServiceError(e))),
        )
      },
      async loadCandidates(itemId) {
        const found = await wrap(getDocs(query(collectionGroup(db(), 'stock'), where('orgRole', '==', 'charity'), where('itemId', '==', itemId))))
        const all = found.docs.map(d => toStockRow(d.id, d.data()))
        const orgIds = [...new Set(all.map(r => r.orgId))]
        const whKeys = [...new Set(all.map(r => `${r.orgId}/${r.warehouseId}`))]
        // One get per doc (a documentId() "in" query would be a list, which stays admin-only); failures are dropped.
        const orgs = await Promise.allSettled(orgIds.map(id => getDoc(doc(db(), 'orgs', id))))
        const charities = orgs.flatMap(r => {
          if (r.status !== 'fulfilled' || !r.value.exists()) return []
          const o = r.value.data()
          return o.role === 'charity' && o.status === 'approved' ? [{ id: r.value.id, name: o.name as string, canDeliver: !!o.canDeliver, workingHours: (o.workingHours as string) ?? '' }] : []
        })
        const okIds = new Set(charities.map(c => c.id))
        const whs = await Promise.allSettled(whKeys.filter(k => okIds.has(k.split('/')[0])).map(k => { const [o, w] = k.split('/'); return getDoc(doc(db(), 'orgs', o, 'warehouses', w)) }))
        const warehouses = whs.flatMap(r => (r.status === 'fulfilled' && r.value.exists() ? [{ ...toWarehouse(r.value.id, r.value.data()), orgId: r.value.ref.parent.parent!.id }] : []))
        return { charities, warehouses, rows: all.filter(r => okIds.has(r.orgId)) }
      },
      async send(hospital, req, choice) {
        const wanted = resolveItem(req.item, normalizeName)
        if (!isValidItemKey(wanted.key) || validateItemName(wanted.name)) throw new ServiceError('invalid-transition', 'bad product')
        const itemRef = doc(db(), 'items', wanted.key)
        const item = await wrap(getDoc(itemRef))
        const itemName = item.exists() ? (item.data().name as string) : wanted.name
        const ref = doc(collection(db(), 'requests'))
        const code = makeReceiptCode()
        const batch = writeBatch(db())
        if (!item.exists()) batch.set(itemRef, { name: itemName, key: wanted.key, createdBy: hospital.uid, createdAt: serverTimestamp() })
        batch.set(ref, {
          hospitalId: hospital.uid, hospitalName: hospital.name, itemId: wanted.key, itemName, qty: req.qty, accept: req.accept, priority: req.priority,
          beneficiaries: req.beneficiaries, neededBy: Timestamp.fromDate(req.neededBy), delivery: { ...req.delivery },
          status: choice ? 1 : 0, open: !choice, ...(choice ?? {}), excluded: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        batch.set(doc(db(), 'requestSecrets', ref.id), { code, hospitalId: hospital.uid })
        batch.set(doc(db(), 'requestContacts', ref.id), { hospitalId: hospital.uid, name: req.receiver.name, phone: req.receiver.phone })
        await wrap(batch.commit())
        return { id: ref.id, code }
      },
    },
  }
}

const isDenied = (e: unknown) => (e as { code?: string }).code === 'permission-denied'

function toRequest(id: string, d: DocumentData): HospitalRequest {
  return {
    ...(d as Omit<HospitalRequest, 'id'>), id, open: !!d.open, excluded: (d.excluded as string[]) ?? [],
    neededBy: toDate(d.neededBy), createdAt: toDate(d.createdAt), updatedAt: toDate(d.updatedAt),
    acceptedAt: d.acceptedAt ? toDate(d.acceptedAt) : undefined,
    lastRejection: d.lastRejection ? { ...d.lastRejection, at: toDate(d.lastRejection.at) } : undefined,
  }
}

function toWarehouse(id: string, d: DocumentData): Warehouse {
  return { id, name: d.name, city: d.city, district: d.district, location: { lat: d.location.lat, lng: d.location.lng }, createdAt: toDate(d.createdAt), updatedAt: toDate(d.updatedAt) }
}

function toStockRow(id: string, d: DocumentData): StockRow {
  return { ...(d as Omit<StockRow, 'id' | 'updatedAt'>), id, updatedAt: toDate(d.updatedAt) }
}
