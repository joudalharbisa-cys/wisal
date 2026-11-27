import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  limit,
  orderBy,
  type Transaction,
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
import { planReservation } from '../features/requests/reserve'
import type { HospitalRequest } from '../features/requests/types'
import { ADMIN_ACTOR, type Actor, type EventInput, type RequestEvent } from '../features/requests/events'
import { formatDateTime, personLine } from '../features/requests/timeline'
import { toWesternDigits } from '../features/requests/validate'
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
  type Built = { change: Record<string, unknown>; event: EventInput }
  /** One step of a request, in a transaction: read it, let `build` check it (and read/write other docs), apply the change,
   *  bump `eventCount` and append the matching entry to its step log (requests/{id}/events/{n}). */
  const step = (id: string, by: Actor, build: (r: HospitalRequest, raw: DocumentData, tx: Transaction) => Promise<Built>) =>
    runTransaction(db(), async tx => {
      const ref = doc(db(), 'requests', id)
      const s = await tx.get(ref)
      if (!s.exists()) throw new ServiceError('invalid-transition', 'taken')
      const raw = s.data()
      const { change, event } = await build(toRequest(id, raw), raw, tx)
      const n = ((raw.eventCount as number | undefined) ?? 0) + 1
      tx.update(ref, { ...change, eventCount: n })
      tx.set(doc(db(), 'requests', id, 'events', String(n)), defined({ ...event, at: serverTimestamp(), byRole: by.role, byName: by.name }))
    })
  const simple = (id: string, by: Actor, change: Record<string, unknown>, event: EventInput) => wrap(step(id, by, async () => ({ change, event })))
  /** The hospital moves on after a rejection: the request change plus, if there is one, moving the rejection off the
   *  request (other charities may read it) into the hospital-only requestHistory — one transaction, as the rules require. */
  const moveOn = (by: Actor, id: string, change: Record<string, unknown>, event: EventInput) =>
    wrap(step(id, by, async (_r, raw, tx) => {
      // An admin return note goes away once the hospital moves on (the rules require it).
      const base = raw.adminReturn ? { ...change, adminReturn: deleteField() } : change
      if (!raw.lastRejection) return { change: base, event }
      tx.set(doc(db(), 'requestHistory', id), { hospitalId: raw.hospitalId, lastRejection: raw.lastRejection })
      return { change: { ...base, lastRejection: deleteField() }, event }
    }))
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
      async changePassword(current, next) {
        const u = auth().currentUser
        if (!u?.email) throw new ServiceError('invalid-transition', 'signed out')
        if (next.length < 8) throw new ServiceError('weak-password')
        // Firebase asks for a recent sign-in before a password change: confirm with the current password first.
        await wrap(reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current)))
        await wrap(updatePassword(u, next))
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
      async resetCode(id) {
        await wrap(step(id, ADMIN_ACTOR, async r => {
          if (r.status !== 5 || (r.codeFails ?? 0) < 1) throw new ServiceError('invalid-transition', 'reset')
          return { change: { codeFails: 0, updatedAt: serverTimestamp() }, event: { type: 'unlocked' } }
        }))
      },
      async returnToHospital(id, reason) {
        const why = reason.trim()
        if (why.length < 3 || why.length > 200) throw new ServiceError('invalid-transition', 'return')
        await wrap(step(id, ADMIN_ACTOR, async r => {
          if (r.status !== 1) throw new ServiceError('invalid-transition', 'return')
          return {
            change: {
              status: 0, open: false, charityId: deleteField(), charityName: deleteField(), warehouseId: deleteField(),
              adminReturn: { charityName: r.charityName ?? '', reason: why, at: serverTimestamp() }, updatedAt: serverTimestamp(),
            },
            event: { type: 'returned', charityName: r.charityName ?? '', detail: why },
          }
        }))
      },
      async setNote(id, text) {
        const note = text?.trim() ?? null
        if (note !== null && (note.length < 2 || note.length > 300)) throw new ServiceError('invalid-transition', 'note')
        await wrap(step(id, ADMIN_ACTOR, async () => ({
          change: { adminNote: note ? { text: note, at: serverTimestamp() } : deleteField(), updatedAt: serverTimestamp() },
          event: note ? { type: 'note', detail: note } : { type: 'note' },
        })))
      },
      watchAllOrgs(cb, onError) {
        return onSnapshot(collection(db(), 'orgs'), s => cb(s.docs.map(d => ({ ...toOrg(d.data(snap)), id: d.id }))), e => onError?.(toServiceError(e)))
      },
      watchAllRequests(cb, onError) {
        return onSnapshot(
          collection(db(), 'requests'),
          s => cb(s.docs.map(d => toRequest(d.id, d.data(snap))).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())),
          e => onError?.(toServiceError(e)),
        )
      },
      watchAllStock(cb, onError) {
        return onSnapshot(collectionGroup(db(), 'stock'), s => cb(s.docs.map(d => toStockRow(d.id, d.data(snap)))), e => onError?.(toServiceError(e)))
      },
      watchRecentEvents(max, cb, onError) {
        return onSnapshot(
          query(collectionGroup(db(), 'events'), orderBy('at', 'desc'), limit(max)),
          s => cb(s.docs.map(d => toEvent(d.ref.parent.parent!.id, d.id, d.data(snap)))),
          e => onError?.(toServiceError(e)),
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
      watchEvents(id, cb) {
        return onSnapshot(
          collection(db(), 'requests', id, 'events'),
          s => cb(s.docs.map(d => toEvent(id, d.id, d.data(snap))).sort((a, b) => a.n - b.n)),
          () => cb([]),
        )
      },
      watchRejection(id, cb) {
        return onSnapshot(
          doc(db(), 'requestHistory', id),
          s => { const lr = s.data()?.lastRejection; cb(lr ? { charityName: lr.charityName, reason: lr.reason, at: toDate(lr.at) } : null) },
          () => cb(null),
        )
      },
      watchContact(id, cb, onError) {
        return onSnapshot(
          doc(db(), 'requestContacts', id),
          s => cb(s.exists() ? { name: s.data().name as string, phone: s.data().phone as string } : null),
          e => (isDenied(e) ? cb(null) : onError?.(toServiceError(e))),
        )
      },
      watchIncoming(charityId, cb, onError) {
        return onSnapshot(
          query(collection(db(), 'requests'), where('charityId', '==', charityId)),
          s => cb(s.docs.map(d => toRequest(d.id, d.data(snap))).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())),
          e => onError?.(toServiceError(e)),
        )
      },
      watchOpen(cb, onError) {
        return onSnapshot(
          query(collection(db(), 'requests'), where('status', '==', 0), where('open', '==', true)),
          s => cb(s.docs.map(d => toRequest(d.id, d.data(snap))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
          e => onError?.(toServiceError(e)),
        )
      },
      async accept(charity, id, warehouseId) {
        const taken = () => new ServiceError('invalid-transition', 'taken')
        try {
          await step(id, charity, async (r, _raw, tx) => {
            const sent = r.status === 1 && r.charityId === charity.uid
            const open = r.status === 0 && r.open
            if (!sent && !open) throw taken()
            // Transactions can't query: read this warehouse's two possible rows by id.
            const refs = (['new', 'used'] as const).map(c => doc(db(), 'orgs', charity.uid, 'stock', stockId(warehouseId, r.itemId, c)))
            const rows = (await Promise.all(refs.map(ref => tx.get(ref)))).filter(s => s.exists()).map(s => toStockRow(s.id, s.data()))
            const plan = planReservation(r, warehouseId, rows)
            if (!plan) throw new ServiceError('invalid-transition', 'short')
            for (const [sid, n] of Object.entries(plan)) {
              const row = rows.find(x => x.id === sid)!
              tx.update(doc(db(), 'orgs', charity.uid, 'stock', sid), { reserved: row.reserved + n, updatedAt: serverTimestamp() })
            }
            return {
              change: sent
                ? { status: 2, warehouseId, reservation: plan, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() }
                : { status: 2, open: false, charityId: charity.uid, charityName: charity.name, warehouseId, reservation: plan,
                    acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() },
              event: { type: sent ? 'accepted' : 'taken' },
            }
          })
        } catch (e) {
          if (e instanceof ServiceError) throw e
          if (isDenied(e)) throw taken() // lost the race: the request is no longer ours to read/write
          throw toServiceError(e)
        }
      },
      async reject(charity, id, reason) {
        await wrap(step(id, charity, async r => {
          if (r.status !== 1 || r.charityId !== charity.uid) throw new ServiceError('invalid-transition', 'taken')
          return {
            change: {
              status: 0, open: false, charityId: deleteField(), charityName: deleteField(), warehouseId: deleteField(),
              excluded: [...r.excluded, charity.uid],
              lastRejection: { charityName: r.charityName ?? '', reason: reason.trim(), at: serverTimestamp() },
              updatedAt: serverTimestamp(),
            },
            event: { type: 'rejected', detail: reason.trim() || undefined },
          }
        }))
      },
      async chooseAgain(hospital, id, choice) {
        await moveOn(hospital, id, { status: 1, open: false, ...choice, sentAt: serverTimestamp(), updatedAt: serverTimestamp() }, { type: 'resent', charityName: choice.charityName })
      },
      async startPreparing(charity, id, canDeliver) {
        await simple(id, charity, { status: 3, mode: canDeliver ? 'delivery' : 'pickup', preparingAt: serverTimestamp(), updatedAt: serverTimestamp() }, { type: 'preparing' })
      },
      async dispatch(charity, id, driver) {
        await simple(id, charity, {
          status: 4, outAt: serverTimestamp(), updatedAt: serverTimestamp(),
          ...(driver ? { driver: { name: driver.name.trim(), phone: driver.phone, eta: Timestamp.fromDate(driver.eta) } } : {}),
        }, driver ? { type: 'dispatched', detail: personLine('السائق', { ...driver, name: driver.name.trim() }, 'يوصل تقريبًا') } : { type: 'ready' })
      },
      async markArrived(charity, id) {
        await simple(id, charity, { status: 5, arrivedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { type: 'arrived' })
      },
      async submitCode(charity, id, code) {
        const ref = doc(db(), 'requests', id)
        const attempt = toWesternDigits(code).trim()
        // 1) Store and count the attempt (and log it, without the digits). 2) Close only if the stored attempt matches:
        //    the rules compare it with the secret; the same transaction deducts the stock and logs «verified».
        let fails: number
        try {
          fails = await runTransaction(db(), async tx => {
            const snapR = await tx.get(ref)
            if (!snapR.exists()) throw new ServiceError('invalid-transition', 'taken')
            const raw = snapR.data()
            const f = (raw.codeFails as number | undefined) ?? 0
            if (f >= 5) return f
            const n = ((raw.eventCount as number | undefined) ?? 0) + 1
            tx.update(ref, { codeAttempt: attempt, codeFails: f + 1, updatedAt: serverTimestamp(), eventCount: n })
            tx.set(doc(db(), 'requests', id, 'events', String(n)), { type: 'codeAttempt', count: f + 1, at: serverTimestamp(), byRole: charity.role, byName: charity.name })
            return f
          })
        } catch (e) {
          if (e instanceof ServiceError) throw e
          if (isDenied(e)) return { result: 'locked', remaining: 0 }
          throw new ServiceError('network')
        }
        if (fails >= 5) return { result: 'locked', remaining: 0 }
        const remaining = 5 - (fails + 1)
        try {
          await step(id, charity, async (r, _raw, tx) => {
            // The rules require stock rows to carry the warehouse's current name/city: rewrite them so a stale row can't block closing.
            const wh = (await tx.get(doc(db(), 'orgs', charity.uid, 'warehouses', r.warehouseId ?? '-'))).data() ?? {}
            const place = typeof wh.name === 'string' && typeof wh.city === 'string' ? { warehouseName: wh.name, city: wh.city } : {}
            for (const [sid, n] of Object.entries(r.reservation ?? {}))
              tx.update(doc(db(), 'orgs', charity.uid, 'stock', sid), { qty: increment(-n), reserved: increment(-n), ...place, updatedAt: serverTimestamp() })
            return { change: { status: 6, verifiedAt: serverTimestamp(), updatedAt: serverTimestamp() }, event: { type: 'verified' } }
          })
          return { result: 'ok', remaining }
        } catch (e) {
          if (isDenied(e)) return { result: 'wrong', remaining }
          throw new ServiceError('network')
        }
      },
      async setPickup(hospital, id, courier) {
        const p = { name: courier.name.trim(), phone: courier.phone, eta: courier.eta }
        await simple(id, hospital, { pickup: { ...p, eta: Timestamp.fromDate(p.eta) }, updatedAt: serverTimestamp() }, { type: 'pickupSet', detail: personLine('مندوب المستشفى', p, 'يجي') })
      },
      async unlockCode(hospital, id) {
        await simple(id, hospital, { codeFails: 0, updatedAt: serverTimestamp() }, { type: 'unlocked' })
      },
      async setMeeting(by, id, meeting) {
        await simple(id, by, {
          meeting: meeting ? { at: Timestamp.fromDate(meeting.at), link: meeting.link.trim(), byRole: by.role, byName: by.name } : deleteField(),
          updatedAt: serverTimestamp(),
        }, meeting ? { type: 'meetingSet', detail: `${formatDateTime(meeting.at)} · ${meeting.link.trim()}` } : { type: 'meetingRemoved' })
      },
      async publishOpen(hospital, id) {
        await moveOn(hospital, id, { open: true, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { type: 'published' })
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
          status: choice ? 1 : 0, open: !choice, ...(choice ?? {}), ...(choice ? { sentAt: serverTimestamp() } : { publishedAt: serverTimestamp() }),
          excluded: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), eventCount: 1,
        })
        batch.set(doc(db(), 'requests', ref.id, 'events', '1'), defined({
          type: choice ? 'sent' : 'published', charityName: choice?.charityName, at: serverTimestamp(), byRole: hospital.role, byName: hospital.name,
        }))
        batch.set(doc(db(), 'requestSecrets', ref.id), { code, hospitalId: hospital.uid })
        batch.set(doc(db(), 'requestContacts', ref.id), { hospitalId: hospital.uid, name: req.receiver.name, phone: req.receiver.phone })
        await wrap(batch.commit())
        return { id: ref.id, code }
      },
    },
  }
}

const isDenied = (e: unknown) => (e as { code?: string }).code === 'permission-denied'

/** Drops undefined fields (Firestore refuses them). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function toEvent(requestId: string, eid: string, d: DocumentData): RequestEvent {
  return { ...(d as Omit<RequestEvent, 'n' | 'requestId' | 'at'>), n: Number(eid), requestId, at: toDate(d.at) }
}

function toRequest(id: string, raw: DocumentData): HospitalRequest {
  // The last typed code attempt never leaves the service layer (after verification it equals the receipt code).
  const { codeAttempt: _attempt, ...d } = raw
  return {
    ...(d as Omit<HospitalRequest, 'id'>), id, excluded: (d.excluded as string[]) ?? [],
    // Before phase 5 there was no `open`: a status-0 request was open.
    open: typeof d.open === 'boolean' ? d.open : d.status === 0,
    legacyReceiver: d.receiver ? { name: d.receiver.name, phone: d.receiver.phone } : undefined,
    neededBy: toDate(d.neededBy), createdAt: toDate(d.createdAt), updatedAt: toDate(d.updatedAt),
    acceptedAt: d.acceptedAt ? toDate(d.acceptedAt) : undefined,
    lastRejection: d.lastRejection ? { ...d.lastRejection, at: toDate(d.lastRejection.at) } : undefined,
    ...Object.fromEntries((['sentAt', 'publishedAt', 'preparingAt', 'outAt', 'arrivedAt', 'verifiedAt'] as const).map(k => [k, d[k] ? toDate(d[k]) : undefined])),
    driver: d.driver ? { ...d.driver, eta: toDate(d.driver.eta) } : undefined,
    pickup: d.pickup ? { ...d.pickup, eta: toDate(d.pickup.eta) } : undefined,
    meeting: d.meeting ? { ...d.meeting, at: toDate(d.meeting.at) } : undefined,
    adminNote: d.adminNote ? { text: d.adminNote.text, at: toDate(d.adminNote.at) } : undefined,
    adminReturn: d.adminReturn ? { ...d.adminReturn, at: toDate(d.adminReturn.at) } : undefined,
  }
}

function toWarehouse(id: string, d: DocumentData): Warehouse {
  return { id, name: d.name, city: d.city, district: d.district, location: { lat: d.location.lat, lng: d.location.lng }, createdAt: toDate(d.createdAt), updatedAt: toDate(d.updatedAt) }
}

function toStockRow(id: string, d: DocumentData): StockRow {
  return { ...(d as Omit<StockRow, 'id' | 'updatedAt'>), id, updatedAt: toDate(d.updatedAt) }
}
