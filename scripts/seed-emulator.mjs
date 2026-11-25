// Seeds the Firebase emulators (never touches production): a test admin, plus an approved
// hospital and charity with one warehouse and a few stock rows each (phase 2).
// Usage: start `npm run emulators`, then `npm run seed:emulator`.
const PROJECT = 'demo-wesal'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const DB = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`
const PASSWORD = 'wesal-test-123'

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, json: await r.json() }
}

async function account(email, password) {
  let res = await post(`${AUTH}/accounts:signUp?key=demo-key`, { email, password, returnSecureToken: true })
  if (!res.ok) res = await post(`${AUTH}/accounts:signInWithPassword?key=demo-key`, { email, password, returnSecureToken: true })
  if (!res.ok) throw new Error(`auth emulator: ${JSON.stringify(res.json)}`)
  return res.json.localId
}

// Plain JS values → Firestore REST "fields".
function value(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (Number.isInteger(v)) return { integerValue: String(v) }
  if (typeof v === 'number') return { doubleValue: v }
  return { mapValue: { fields: fields(v) } }
}
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]))

async function put(path, data) {
  const r = await fetch(`${DB}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: fields(data) }),
  })
  if (!r.ok) throw new Error(`firestore emulator (${path}): ${await r.text()}`)
}

// Same rules as src/features/inventory/names.ts normalizeName (kept tiny on purpose).
const key = s => s.toLowerCase().replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\//g, '-').replace(/_+/g, '_')
  .split(/\s+/).filter(Boolean).map(w => (w.startsWith('ال') && w.length - 2 >= 2 ? w.slice(2) : w)).join(' ')

const now = new Date()
const adminUid = await account('admin@wesal.test', 'wesal-admin-123')
await put(`admins/${adminUid}`, { name: 'مدير وصال (تجريبي)' })

const orgs = [
  { email: 'hospital@wesal.test', org: { role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-10001', hospitalType: 'gov' },
    wh: { name: 'مخزن المستشفى', city: 'جدة', district: 'الشرفية', location: { lat: 21.5292, lng: 39.1989 } },
    stock: [['كراسي متحركة', 'used', 6], ['أجهزة قياس ضغط', 'new', 14]] },
  { email: 'charity@wesal.test', org: { role: 'charity', name: 'جمعية البر بجدة', city: 'جدة', district: 'النعيم', licenseNo: '4521', workingHours: 'الأحد إلى الخميس، 8 ص إلى 4 م', canDeliver: true },
    wh: { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.6215, lng: 39.1465 } },
    stock: [['كراسي متحركة', 'new', 40], ['كراسي متحركة', 'used', 12], ['أسرّة طبية', 'new', 8]] },
]

for (const o of orgs) {
  const uid = await account(o.email, PASSWORD)
  await put(`orgs/${uid}`, {
    ...o.org, status: 'approved', contactEmail: o.email,
    contract: { version: '1.0-draft', acceptedAt: now, acceptedByName: 'موقّع تجريبي' },
    createdAt: now, updatedAt: now, reviewedBy: adminUid, reviewedAt: now,
  })
  const whId = 'seed-wh'
  await put(`orgs/${uid}/warehouses/${whId}`, { ...o.wh, createdAt: now, updatedAt: now })
  for (const [name, condition, qty] of o.stock) {
    const k = key(name)
    await put(`items/${k}`, { name, key: k, createdBy: uid, createdAt: now })
    await put(`orgs/${uid}/stock/${whId}__${k}__${condition}`, {
      orgId: uid, orgName: o.org.name, orgRole: o.org.role, warehouseId: whId, warehouseName: o.wh.name, city: o.wh.city,
      itemId: k, itemName: name, condition, qty, reserved: 0, updatedAt: now,
    })
  }
  console.log(`approved ${o.org.role}: ${o.email}`)
}
console.log(`test admin: admin@wesal.test · orgs password: ${PASSWORD}`)
