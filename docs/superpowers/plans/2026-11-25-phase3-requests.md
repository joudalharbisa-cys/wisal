# Phase 3+4 — Hospital Request and Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An approved hospital fills one request, sees charities that can cover it ranked by the prototype formula, picks one (or publishes an open request), gets a 4-digit receipt code, and follows its requests in «طلباتي».

**Architecture:** Pure domain code in `src/features/requests/` (types, validation, ranking, code, geocode parsing). Rules for `requests`, `requestSecrets`, and hospital reads of approved charity orgs. A `requests` section on `Services` (Firebase + fake). Pages follow the approved spike on branch `phase3-screens` (`src/preview/requests/*`): copy markup, not data.

**Tech Stack:** as phase 2 (React 19, TS, Tailwind v4, Firebase 12, leaflet/react-leaflet, Vitest, rules-unit-testing).

**Spec:** `docs/superpowers/specs/2026-11-25-phase3-requests-design.md`

## Global Constraints

- Spark only; no Cloud Functions. Code from `crypto.getRandomValues`.
- Western digits everywhere (no native `type="number"` / `type="date"` inputs; use `inputMode` + `dir="ltr"`).
- One product per request; `accept` is `'new' | 'any'`; priority `'urgent' | 'medium' | 'normal'`.
- Ranking: Haversine with earth diameter 12742 km; `eta = d×1.3/45+0.5`; `sd=e^(−d/40)`; `ss=min(1, avail/(qty×1.5))`; `su=max(0,1−eta/window)`; windows 6/24/72 h; weights .40/.25/.35, .35/.35/.30, .30/.50/.20; `round(100×…)`; sort score desc then distance asc.
- Status 0 copy «طلب مفتوح», status 1 «بانتظار موافقة الجمعية».
- Nominatim: ≤ 1 call/s (throttle), stale answers ignored, cache by 4-decimal coordinates.
- Installs to D:. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Receiver phone typed as «٠٥٥١٢٣٤٥٦٧» or «+966551234567» → stored as `0551234567`. (Task 1 test.)
2. A charity whose stock is split across two warehouses (30 + 30) for a 40 request → not suitable (no single warehouse covers it). (Task 1 test.)
3. `accept: 'new'` with 10 new + 40 used in one warehouse for a 20 request → excluded; with `'any'` → included with available 50. (Task 1 test.)
4. A charity user opening `/app/requests/new` or another hospital's request id → redirected / «ما لقينا هذا الطلب», never the code. (Tasks 2, 7, 8 tests.)
5. Moving the pin several times quickly → at most one Nominatim call per second and the last answer wins; a field the user typed after placing the pin isn't overwritten. (Task 5 test.)

---

### Task 1: Request domain — types, validation, ranking, code

**Files:** Create `src/features/requests/{types.ts,validate.ts,rank.ts,code.ts}`. Test `tests/unit/requests-domain.test.ts`.

**Interfaces — produces:**
```ts
// types.ts
export type Accept = 'new' | 'any'
export type DeliveryPlace = { lat: number; lng: number; city: string; district: string; details: string }
export type RequestDraft = { item: ItemChoice | null; qty: string; accept: Accept; priority: Priority; beneficiaries: string; neededBy: string /* YYYY-MM-DD */;
  receiverName: string; receiverPhone: string; delivery: DeliveryPlace | null; city: string; district: string; details: string }
export type ValidRequest = { item: ItemChoice; qty: number; accept: Accept; priority: Priority; beneficiaries: number; neededBy: Date;
  receiver: { name: string; phone: string }; delivery: DeliveryPlace }
export type HospitalRequest = { id: string; hospitalId: string; hospitalName: string; itemId: string; itemName: string; qty: number; accept: Accept;
  priority: Priority; beneficiaries: number; neededBy: Date; receiver: { name: string; phone: string }; delivery: DeliveryPlace;
  status: RequestStatus; charityId?: string; charityName?: string; warehouseId?: string; createdAt: Date; updatedAt: Date }
export type CharityInfo = { id: string; name: string; canDeliver: boolean; workingHours: string }
export type Candidates = { charities: CharityInfo[]; warehouses: (Warehouse & { orgId: string })[]; rows: StockRow[] }
export type Ranked = { charity: CharityInfo; warehouse: Warehouse & { orgId: string }; available: number; distanceKm: number; etaHours: number; score: number }
export const ACCEPT_LABEL: Record<Accept, string>   // 'جديد بس' / 'جديد او مستعمل'
```
- `validate.ts`: `parsePhone(s): string | null` (Arabic-Indic digits, spaces, `+9665…`/`9665…`/`05…` → `05XXXXXXXX`), `parseDateInput(s): Date | null` (`YYYY-MM-DD` or `D/M/YYYY`, Western or Arabic-Indic digits), `validateRequest(d: RequestDraft, today: Date): { value?: ValidRequest; errors: Partial<Record<'item'|'qty'|'beneficiaries'|'neededBy'|'receiverName'|'receiverPhone'|'delivery'|'city'|'district'|'details', string>> }`. Messages: «اختر المنتج», «اكتب الكمية بالأرقام من 1 إلى 99999», «اكتب عدد المستفيدين بالأرقام», «اختر تاريخ اليوم او بعده», «اكتب اسم المستلم», «رقم جوال سعودي يبدأ بـ 05», «حدد مكان التسليم على الخريطة», «اختر المدينة», «اكتب الحي», «التفاصيل 100 حرف بالكثير». `qty` reuses `parseQty` but 0 is invalid.
- `rank.ts`: `haversineKm(a: LatLng, b: LatLng): number`, `rankCharities(req: { itemId: string; qty: number; accept: Accept; priority: Priority; delivery: LatLng }, c: Candidates): Ranked[]` (algorithm per Global Constraints and spec), `formatKm(d): string` (1 decimal under 100), `etaText(h): string` («أقل من ساعة» < 1, «ساعة تقريبًا» < 1.5, «ساعتين تقريبًا» < 2.5, else «N ساعات تقريبًا» rounded).
- `code.ts`: `makeReceiptCode(rand?: () => number): string` — 4 digits, zero-padded, default `crypto.getRandomValues`.

- [ ] **Step 1: Failing tests** — names and key assertions:
  - `reference ranking matches the prototype`: delivery 21.5433,39.1728; five charities from the spec table (one warehouse each, `new` rows); 40 urgent, accept any → names `['جمعية الشمال','جمعية البر بجدة','جمعية الشرق']`, scores `[90, 89, 84]`, `formatKm` of first `'6.1'`.
  - `a charity split across two warehouses is not suitable` (30+30 for 40 → `[]`).
  - `accept new counts only new stock` (10 new + 40 used, qty 20: `'new'` → `[]`; `'any'` → available 50).
  - `reserved stock is not available` (qty 50 reserved 20, request 40 → excluded).
  - `picks the best warehouse of a charity` (two suitable warehouses → the nearer one's id).
  - `parses Saudi phones`: `'0551234567'`, `'٠٥٥١٢٣٤٥٦٧'`, `'+966551234567'`, `'966 55 123 4567'` → `'0551234567'`; `'0451234567'`, `'05512'` → null.
  - `validates a request draft` — valid draft → `value` with numbers/Date; each error message above for its bad field; neededBy yesterday rejected, today accepted.
  - `receipt codes are four digits` — `makeReceiptCode(() => 0)` → `'0000'`, `(() => 0.99999)` → `'9999'`, default matches `/^\d{4}$/`.
- [ ] **Step 2:** `npx vitest run tests/unit/requests-domain.test.ts` → FAIL (modules missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(requests): domain — validation, ranking, receipt code`.

---

### Task 2: Rules — requests, secrets, charity org reads

**Files:** Modify `firestore.rules`. Test `tests/rules/requests.rules.test.ts` (same harness as `inventory.rules.test.ts`; orgs h1 approved hospital, h2 approved hospital, c1 approved charity with warehouse `wc`, pc pending charity, ph pending hospital; item seeded).

**Interfaces — produces:** rules exactly as the spec's "Security rules (additions)" + "Calls made after the builder check" (request create requires `existsAfter(requestSecrets/id)`; secret create requires `existsAfter(requests/id)` with same `hospitalId`; `orgs/{uid}` get for approved hospital when target `role == 'charity' && status == 'approved'`).

- [ ] **Step 1: Failing tests:** `hospital sends a request with its code in one batch`, `hospital publishes an open request with its code`, `request without a code is rejected`, `code without a request is rejected`, `charity cannot create a request`, `pending hospital cannot create`, `spoofed hospitalName rejected`, `sending to a pending charity rejected`, `charityName must match the charity`, `warehouse must belong to the charity`, `status 1 requires charity fields; status 0 forbids them`, `bad phone / qty 0 / delivery outside Saudi box rejected`, `owner reads own request and code`, `other hospital cannot read request or code`, `charity cannot read request or code`, `owner lists own requests filtered by hospitalId; unfiltered list denied`, `nobody updates or deletes a request`, `hospital reads an approved charity org`, `hospital cannot read another hospital org or a pending charity org`, `charity cannot read another charity org`.
- [ ] **Step 2:** `npm run test:rules` → new tests FAIL.
- [ ] **Step 3:** Implement rules. Phone regex `^05[0-9]{8}$`; code `^[0-9]{4}$`.
- [ ] **Step 4:** `npm run test:rules` → all PASS.
- [ ] **Step 5:** Commit `feat(rules): requests, receipt codes, hospital reads of charity orgs`.

---

### Task 3: Services interface + fake requests

**Files:** Modify `src/services/types.ts`, `src/services/fakeServices.ts`. Test `tests/unit/fake-requests.test.ts`.

**Interfaces — produces on `Services`:**
```ts
requests: {
  watchMine(uid: string, cb: (r: HospitalRequest[]) => void, onError?: (e: ServiceError) => void): Unsubscribe   // newest first
  watchOne(id: string, cb: (r: HospitalRequest | null) => void, onError?): Unsubscribe
  watchCode(id: string, cb: (code: string | null) => void, onError?): Unsubscribe
  loadCandidates(itemId: string): Promise<Candidates>
  send(hospital: OrgRef, req: ValidRequest, choice: { charityId: string; charityName: string; warehouseId: string } | null): Promise<{ id: string; code: string }>
}
```
`send` creates the item if needed (same as `setStock`), the request (status 1 with choice, else 0) and its secret. Fake: only approved hospitals may send; `watchOne`/`watchCode` give `null` for requests of another hospital (the fake knows the signed-in user); `loadCandidates` returns approved charities' rows for `itemId` with their warehouses and `CharityInfo` (from org `canDeliver`/`workingHours`). Seed gains `requests?: HospitalRequest[]`, `codes?: Record<string,string>`; `failures.requests?: boolean` (listeners error, send rejects).

- [ ] **Step 1: Failing tests:** `hospital sends to a charity and sees it with its code`, `open request has status 0 and a code`, `charity cannot send`, `another hospital sees null for the request and code`, `loadCandidates returns only charity rows for the item, with warehouses and charity info`, `watchMine is newest first`.
- [ ] **Step 2–4:** FAIL → implement (+ stub `requests` in `createFirebaseServices` throwing `ServiceError('unknown')`) → PASS; `npm run build` OK.
- [ ] **Step 5:** Commit `feat(services): requests interface and fake`.

---

### Task 4: Firebase requests + indexes + deploy

**Files:** Modify `src/services/firebaseServices.ts`; create `firestore.indexes.json`; modify `firebase.json` (`"firestore": { "rules": …, "indexes": "firestore.indexes.json" }`), `package.json` deploy → `firebase deploy --only hosting,firestore:rules,firestore:indexes`. Test `tests/integration/requests.test.ts` (two clients like `inventory.test.ts`: approved hospital + approved charity with a warehouse and 50 chairs).

Notes: `loadCandidates` = `getDocs(query(collectionGroup(db,'stock'), where('orgRole','==','charity'), where('itemId','==',itemId)))`, then per distinct charity `getDoc(orgs/id)` and per distinct warehouse `getDoc(orgs/id/warehouses/wid)` with `Promise.allSettled`, dropping failures and non-approved orgs. `send` = `writeBatch`: item (only if missing — check with `getDoc` first), request (`doc(collection(db,'requests'))`), secret; timestamps `serverTimestamp()`; `neededBy` as `Timestamp.fromDate`. `watchOne`/`watchCode`: permission-denied → `cb(null)`. `firestore.indexes.json`: `fieldOverrides` for collectionGroup `stock` fields `itemId` and `orgRole`, each with `COLLECTION` ASC, DESC, CONTAINS and `COLLECTION_GROUP` ASC.

- [ ] **Step 1: Failing tests:** `hospital loads candidates and sends to the charity`, `open request is stored with a code`, `hospital sees own requests newest first`, `charity cannot read the hospital's request` (expect `watchOne` → null).
- [ ] **Step 2–4:** `npm run test:integration` FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(services): Firebase requests, collection-group indexes`.

---

### Task 5: Pin → address auto-fill (shared)

**Files:** Create `src/features/geo/reverseGeocode.ts`, `src/features/geo/useAddressFromPin.ts`. Modify `src/pages/app/WarehouseForm.tsx`. Test `tests/unit/reverse-geocode.test.ts` and extend `tests/unit/warehouse-form.test.tsx`.

**Interfaces — produces:**
- `parseNominatim(json: unknown): { city?: City; district?: string }` — district from `suburb|neighbourhood|quarter|city_district`; city from `city|town|state` matched to CITIES by `normalizeName` containment either way.
- `createReverseGeocoder(fetchFn = fetch, now = Date.now): (p: LatLng) => Promise<{ city?: City; district?: string } | null>` — throttle ≥ 1000 ms between network calls (a call inside the window waits for it; only the latest pending call is sent, earlier ones resolve `null`), cache by `lat.toFixed(4),lng.toFixed(4)`, errors → `null`. URL `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=ar&lat=…&lon=…`.
- `useAddressFromPin(pin: LatLng | null, apply: (a: { city?: City; district?: string }) => void, geocoder?)` — calls `apply` with the newest result only. Pages pass an `apply` that skips fields the user edited since the pin moved (track a `touched` flag reset on each pin change).

- [ ] **Step 1: Failing tests:** `parses a Nominatim answer into city and district` (sample JSON with `city: 'جدة'`, `suburb: 'الشرفية'` → `{ city: 'جدة', district: 'الشرفية' }`; `state: 'منطقة مكة المكرمة'`, no city → city `'مكة المكرمة'`; unknown city → district only), `throttles to one call per second and keeps the last` (fake fetch + fake clock: three calls 200 ms apart → 1 network call for the third point; earlier promises resolve null), `caches repeated points`, `network error resolves null`; warehouse form: `placing the pin fills district and city`, `a district typed after the pin is kept` (inject a fake geocoder via `vi.mock('../../src/features/geo/reverseGeocode', …)`).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(geo): fill district and city from the map pin`.

---

### Task 6: Navigation and homes by role

**Files:** Create `src/pages/app/Home.tsx` (hospital → `MyRequests`, charity → `MyStock`). Modify `src/App.tsx` (`/app` → `Home`, `/app/stock` → `MyStock`, `/app/requests/new`, `/app/requests/:id` added in Tasks 7–8), `src/layout/AppShell.tsx` (hospital nav «طلباتي» `/app` end + «مخزوني» `/app/stock`; charity nav «مخزوني» `/app` end), `WarehouseForm.tsx` (after save/delete/cancel → `/app/stock`). Update tests that assumed the hospital home is «مخزوني» (`login.test.tsx`, `pending.test.tsx`, `app-shell.test.tsx`, `my-stock.test.tsx` hospital copy → render `/app/stock`). Test `tests/unit/home.test.tsx`.

`MyRequests` here is a placeholder heading «طلباتي» (real page in Task 8).

- [ ] **Step 1: Failing tests:** `hospital home is طلباتي with مخزوني in the nav`, `charity home stays مخزوني and has no طلباتي link`, `warehouse save returns to /app/stock`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test`).
- [ ] **Step 5:** Commit `feat(app): role homes — hospitals land on طلباتي`.

---

### Task 7: «طلب جديد» — form, ranking step, sent step

**Files:** Create `src/pages/app/NewRequest.tsx` (+ `src/features/requests/RankingList.tsx`, `src/features/requests/PrioritySelect.tsx` if helpful). Modify `App.tsx`. Test `tests/unit/new-request.test.tsx` (mock `LocationMap` as in warehouse tests; mock geocoder).

Behaviour: charity → `<Navigate to="/app" />`. Prefill delivery from the hospital's first warehouse (`watchWarehouses`), city/district from it. «اعرض الجمعيات المناسبة» validates (Task 1) then `loadCandidates(itemKey)` and `rankCharities`; loading state; failure Alert «تعذّر تحميل الجمعيات، حاول مرة ثانية». Ranking step per spike `Ranking.tsx`; [رجوع للطلب] keeps values; choose → sticky bar «أرسل الطلب لـ<name>»; none → «ما فيه جمعية عندها الكمية للحين» + [انشره كطلب مفتوح]. Send → sent step per spike `Sent.tsx` (title «وصل طلبك لـ<name>» or «انتشر طلبك كطلب مفتوح»), code, [اعرض الطلب] → `/app/requests/:id`, [اطلب منتج ثاني] → fresh form keeping receiver, delivery, priority, neededBy. Send failure → Alert «ما قدرنا نرسل الطلب، حاول مرة ثانية». Date field: text input `dir="ltr"` placeholder `YYYY-MM-DD`, parsed by `parseDateInput`.

- [ ] **Step 1: Failing tests:** `charity is sent away from the request form`, `shows validation messages`, `ranks charities and sends to the chosen one` (fake seeded with two charities → order by score, choose second, send → sent step shows its name and a 4-digit code; fake has the request with status 1 and that charity), `no suitable charity offers an open request` (→ status 0), `request another product keeps receiver and place`, `prefills the place from the hospital warehouse`, `send failure shows a message`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(requests): new request with ranked charities`.

---

### Task 8: «طلباتي» and request details

**Files:** Create `src/pages/app/MyRequests.tsx` (replace Task 6 placeholder), `src/pages/app/RequestDetails.tsx`; modify `App.tsx`. Test `tests/unit/my-requests.test.tsx`.

Per spikes `MyRequests.tsx` / `Details.tsx`: stats (كل الطلبات / بانتظار موافقة / طلبات مفتوحة), list newest first with priority badge, charity or «ما انرسل لجمعية للحين», status badge (0 → «طلب مفتوح»), 6-segment progress, date (`toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long' })`), row links to `/app/requests/:id`; empty state «ما عندك طلبات للحين» + [طلب جديد]; listener error Alert «تعذّر تحميل الطلبات، حاول مرة ثانية». Details: status steps, fields, receipt code card; null → «ما لقينا هذا الطلب» + link «رجوع لطلباتي».

- [ ] **Step 1: Failing tests:** `lists requests newest first with status`, `empty state offers a new request`, `details show fields and the receipt code`, `another hospital's request id shows not found`, `load error shows a message`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(requests): my requests and request details`.

---

### Task 9: Seed, docs, end-to-end, review, deploy

- [ ] Seed: emulator script adds two more approved charities (الشمال 60 chairs at 21.596,39.155; الشرق 45 at 21.55,39.235) so the reference ranking shows locally; hospital seed warehouse at 21.5433,39.1728.
- [ ] README phase 3 section. `npm test`, `npm run test:rules`, `npm run test:integration`, `npm run build`, `npm run lint`.
- [ ] Emulator walk-through: hospital → new request 40 chairs urgent → ranking shows الشمال/البر/الشرق → send → code → «طلباتي» → details; charity sees nothing new.
- [ ] Final whole-branch review (fresh reviewer, opus), one fix pass.
- [ ] Deploy (rules + indexes + hosting) after the user agrees; push `phase-3`; live check that the ranking query works (index built).
