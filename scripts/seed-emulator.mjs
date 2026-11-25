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
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } }
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
    wh: { name: 'مخزن المستشفى', city: 'جدة', district: 'الشرفية', location: { lat: 21.5433, lng: 39.1728 } },
    stock: [['كراسي متحركة', 'used', 6], ['أجهزة قياس ضغط', 'new', 14]] },
  { email: 'charity@wesal.test', org: { role: 'charity', name: 'جمعية البر بجدة', city: 'جدة', district: 'النعيم', licenseNo: '4521', workingHours: 'الأحد إلى الخميس، 8 ص إلى 4 م', canDeliver: true },
    wh: { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.572, lng: 39.17 } },
    stock: [['كراسي متحركة', 'new', 50], ['كراسي متحركة', 'used', 12], ['أسرّة طبية', 'new', 8]] },
  // Prototype reference charities (phase 3 ranking: الشمال 90، البر 89، الشرق 84 for 40 chairs, urgent, from the hospital).
  { email: 'north@wesal.test', org: { role: 'charity', name: 'جمعية الشمال', city: 'جدة', district: 'الروضة', licenseNo: '4522', workingHours: 'الأحد إلى الخميس، 8 ص إلى 4 م', canDeliver: false },
    wh: { name: 'مستودع الروضة', city: 'جدة', district: 'الروضة', location: { lat: 21.596, lng: 39.155 } },
    stock: [['كراسي متحركة', 'new', 60]] },
  { email: 'east@wesal.test', org: { role: 'charity', name: 'جمعية الشرق', city: 'جدة', district: 'الصفا', licenseNo: '4523', workingHours: 'يوميًا، 9 ص إلى 9 م', canDeliver: true },
    wh: { name: 'مستودع الصفا', city: 'جدة', district: 'الصفا', location: { lat: 21.55, lng: 39.235 } },
    stock: [['كراسي متحركة', 'new', 45]] },
]

const uids = {}
for (const o of orgs) {
  const uid = await account(o.email, PASSWORD)
  uids[o.email] = uid
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
// Phase 5: one request waiting for جمعية البر, and one open request any charity can take.
const hosp = uids['hospital@wesal.test']
const birr = uids['charity@wesal.test']
const chairs = key('كراسي متحركة')
const base = {
  hospitalId: hosp, hospitalName: 'مستشفى الملك فهد', itemId: chairs, itemName: 'كراسي متحركة', accept: 'any', priority: 'urgent',
  beneficiaries: 20, neededBy: new Date(Date.now() + 2 * 864e5),
  delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' },
  excluded: [], createdAt: now, updatedAt: now,
}
const reqs = [
  ['seed-sent', { ...base, qty: 20, status: 1, open: false, charityId: birr, charityName: 'جمعية البر بجدة', warehouseId: 'seed-wh' }],
  ['seed-open', { ...base, qty: 10, priority: 'medium', status: 0, open: true }],
]
for (const [id, r] of reqs) {
  await put(`requests/${id}`, r)
  await put(`requestSecrets/${id}`, { code: String(1000 + Math.floor(Math.random() * 9000)), hospitalId: hosp })
  await put(`requestContacts/${id}`, { hospitalId: hosp, name: 'أحمد الغامدي', phone: '0551234567' })
}
console.log('requests: one sent to جمعية البر, one open')
console.log(`test admin: admin@wesal.test · orgs password: ${PASSWORD}`)
