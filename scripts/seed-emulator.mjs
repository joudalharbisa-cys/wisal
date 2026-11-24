// Creates a local test admin on the Firebase emulators (never touches production).
// Usage: start `npm run emulators`, then `npm run seed:emulator`.
const PROJECT = 'demo-wesal'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const DB = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`
const ADMIN = { email: 'admin@wesal.test', password: 'wesal-admin-123' }

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, json: await r.json() }
}

let res = await post(`${AUTH}/accounts:signUp?key=demo-key`, { ...ADMIN, returnSecureToken: true })
if (!res.ok) res = await post(`${AUTH}/accounts:signInWithPassword?key=demo-key`, { ...ADMIN, returnSecureToken: true })
if (!res.ok) throw new Error(`auth emulator: ${JSON.stringify(res.json)}`)
const uid = res.json.localId

const r = await fetch(`${DB}/admins/${uid}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({ fields: { name: { stringValue: 'مدير وصال (تجريبي)' } } }),
})
if (!r.ok) throw new Error(`firestore emulator: ${await r.text()}`)
console.log(`test admin ready: ${ADMIN.email} (uid ${uid})`)
