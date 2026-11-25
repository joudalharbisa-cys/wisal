# Phase 3+4 — Hospital request and charity ranking (طلب المستشفى والترتيب) Design

Status: agreed in conversation 2026-11-25. Tech plan: `../../../../خطة وصال التقنية.md` (§5 data, §6 rules, §7 phases 3 and 4). Builds on phase 2 (`2026-11-25-phase2-inventory-design.md`).

## Intent

A hospital needs a product. It fills one request, Wesal shows which charities can cover it — ranked by distance, stock and time with the prototype's formula — and the hospital picks one and sends. This is the core of Wesal: the user asked that "when the hospital requests, it tells it charity X has such-and-such". Phases 3 and 4 of the tech plan are merged into one flow at the user's request.

## Decisions taken by the user

| Topic | Decision |
|---|---|
| Phases | **Merge phase 3 (request) and phase 4 (ranking + choose)** into one flow. |
| Products per request | **One product per request** (option أ). A hospital needing three products sends three requests; a «اطلب منتج ثاني» button keeps receiver/place details. |
| New vs used | **The hospital chooses in the request:** «جديد بس» or «جديد او مستعمل». Ranking counts only the matching quantity. |
| Delivery place | **A pin on the map** in the request; distance in the ranking is measured from it to the charity warehouse. Prefilled from the hospital's first warehouse when it has one. |
| Address text | **Placing a pin fills the text fields automatically** (district, city) — in the request **and** in the phase 2 warehouse form. |
| Stock visibility | (Phase 2 change) only hospitals see charity quantities, and only here, in the request flow. |

## Approaches considered

- Products per request: (أ, chosen) one product — simple ranking, one charity, one receipt code per request; (ب) several products — closer to hospital practice but splits across charities, each part needing its own status and code.
- New/used: (أ, chosen) hospital chooses; (ب) always both — may deliver used to a hospital that doesn't want it; (ج) new only — wastes used stock charities register.
- Address auto-fill: OpenStreetMap Nominatim reverse geocoding (chosen: free, no key, same provider as the map tiles, Arabic results via `accept-language=ar`). Google Geocoding needs a billing account and key.

## Goals

- Hospital: «طلب جديد» form → ranked charities → choose → send. Or, when no charity fits, publish as an **open request**.
- Each sent request gets a 4-digit receipt code, readable by the hospital only.
- Hospital: «طلباتي» list and a request detail page (all fields, status, receipt code).
- Pin → district/city auto-fill in the request and the warehouse form.
- Ranking is a pure, tested function; the reference test passes.

## Non-goals (later phases)

- Charity side: seeing, accepting, rejecting requests; open requests list for charities; reservation (phase 5).
- Meeting link, delivery details, code entry and verification (phases 6–7).
- Editing or cancelling a sent request.
- Multiple products per request; partial delivery; charity response timeout.
- Admin view of requests.

## Anti-goals

- A charity or another hospital reading a hospital's request or its receipt code.
- Ranking showing a charity that cannot cover the quantity (in the accepted condition) from one warehouse.
- Sending a request to a pending/rejected charity.

## Flow and screens (style B identity, RTL, Western digits)

Navigation:
- Hospital: «طلباتي» (`/app`, home) · «مخزوني» (`/app/stock`).
- Charity: «مخزوني» (`/app`, unchanged home). `/app/stock` also works for charities (same page).
- Warehouse form's back/after-save target becomes the stock page (`/app/stock` for hospitals, `/app` for charities — builder may simply use `/app/stock` for both).

1. **طلب جديد** (`/app/requests/new`, hospital only; charities are redirected to `/app`)
   - المنتج (phase 2 ProductPicker; picking a never-stored seed product is allowed), الكمية, الحالة المقبولة (ChoiceGroup: «جديد بس» / «جديد او مستعمل», default «جديد او مستعمل»), الأولوية (ChoiceGroup with the three priority colours), عدد المستفيدين, آخر موعد (date, today or later).
   - المستلم: الاسم, الجوال (Saudi mobile, stored as `05XXXXXXXX`; accepts Arabic-Indic digits and `+9665…`).
   - مكان التسليم: map pin (phase 2 LocationMap) + «موقعي الحالي» + typed coordinates; المدينة and الحي auto-filled from the pin (editable); تفاصيل (optional, e.g. «البوابة 3»).
   - Primary button «اعرض الجمعيات المناسبة» (validates first).
2. **الجمعيات المناسبة** (same page, second step; [رجوع للطلب] keeps the form)
   - Header recap: product · qty · priority badge · accepted condition.
   - One row per suitable charity, best first: rank number, name, score (0–100), distance (km, 1 decimal under 100 km), ETA («ساعة تقريبًا» style), available quantity, «توصّل» badge if `canDeliver`, working hours; [اختر]. Choosing highlights the row and enables «أرسل الطلب لـ<name>».
   - None suitable: «ما فيه جمعية عندها الكمية للحين» + [انشره كطلب مفتوح].
3. **تم الإرسال** (after send): success card with the receipt code, «اعطِ الرمز للمندوب عند الاستلام بس», [اعرض الطلب] [اطلب منتج ثاني] (new form prefilled with receiver, place, priority, neededBy).
4. **طلباتي** (`/app` for hospitals): list newest first — product · qty, priority badge, charity name or «طلب مفتوح», status badge, created date; empty state «ما عندك طلبات للحين» + [طلب جديد]. Header action [+ طلب جديد].
5. **تفاصيل الطلب** (`/app/requests/:id`): all fields, 6-step mini progress (identity spike style), receipt code card, delivery place (city، district + details), charity. Unknown id → «ما لقينا هذا الطلب».

Copy for status 0 is «طلب مفتوح» in this phase (the tech plan's «بانتظار جهة مناسبة» label stays in `lib/labels` for later screens). Status 1 = «بانتظار موافقة الجمعية».

## Ranking (pure function, prototype formula — tech plan §6)

```
rankCharities(req: { itemId, qty, accept: 'new' | 'any', priority, delivery: LatLng },
              charities: { id, name, canDeliver, workingHours }[],
              warehouses: Warehouse & { orgId }[],
              rows: StockRow[]): Ranked[]
```
- Per warehouse: `available = Σ (qty − reserved)` of that warehouse's rows for `itemId` whose condition is accepted (`new` only, or `new` + `used`).
- A warehouse is **suitable** if `available ≥ req.qty`. A charity is suitable if at least one of its warehouses is; it is ranked by its best-scoring suitable warehouse, and that warehouse is the one stored on the request.
- `d` = Haversine km (earth diameter 12742) from `delivery` to the warehouse; `eta = d × 1.3 ÷ 45 + 0.5` h; `sd = e^(−d/40)`; `ss = min(1, available ÷ (qty × 1.5))`; `su = max(0, 1 − eta ÷ window)`; window urgent 6 / medium 24 / normal 72; weights (distance/stock/time) urgent .40/.25/.35, medium .35/.35/.30, normal .30/.50/.20; `score = round(100 × (w1·sd + w2·ss + w3·su))`. Sort by score desc, then distance asc.
- Pending/rejected charities never appear (their rows are unreadable anyway; the client also filters by the charity's org status).

**Reference test** (prototype seed, request 40 «كراسي متحركة» urgent, accept any, delivery = مستشفى الملك فهد 21.5433, 39.1728; each charity one warehouse, stock all `new`):

| Charity | Warehouse lat, lng | Available | Expected |
|---|---|---|---|
| جمعية الشمال | 21.596, 39.155 | 60 | 1st, score 90 (d ≈ 6.1 km) |
| جمعية البر بجدة | 21.572, 39.17 | 50 | 2nd, score 89 (d ≈ 3.2 km) |
| جمعية الشرق | 21.55, 39.235 | 45 | 3rd, score 84 (d ≈ 6.5 km) |
| جمعية الساحل | 21.515, 39.125 | 12 | excluded |
| جمعية الجنوب | 21.465, 39.195 | 8 | excluded |

## Data model (Firestore)

```
requests/{id}                      auto id
  hospitalId, hospitalName         == auth uid / org name
  itemId, itemName                 product (item doc must exist; created in the same batch if a seed)
  qty                int 1–99999
  accept             'new' | 'any'
  priority           'urgent' | 'medium' | 'normal'
  beneficiaries      int 1–1000000
  neededBy           timestamp (a date; ≥ today checked in the app)
  receiver           { name 2–60, phone '05' + 8 digits }
  delivery           { lat, lng (Saudi box), city (one of CITIES), district 1–60, details 0–100 }
  status             0 (open) | 1 (sent to a charity)
  charityId, charityName, warehouseId   only when status 1
  excluded           []   (charities that rejected — phase 5)
  createdAt, updatedAt

requestSecrets/{requestId}
  code               '0000'–'9999' (crypto.getRandomValues), hospitalId
```

## Security rules (additions)

- `requests/{id}` **create**: approved hospital; `hospitalId == auth.uid`; `hospitalName == org.name`; key whitelist; field checks as above; `itemName == getAfter(items/itemId).name`; `excluded == []`; timestamps `== request.time`; either `status == 0` with no charity fields, or `status == 1` with `charityId` an **approved charity** (`get(orgs/charityId)`), `charityName` matching it, and `warehouseId` existing under that charity. Created in one batch with its `requestSecrets` doc.
- `requests/{id}` **read**: the owning hospital (`resource.data.hospitalId == auth.uid`) or admin. List queries must filter `hospitalId == auth.uid`. No update/delete in this phase (phase 5 adds charity transitions).
- `requestSecrets/{id}` **create**: approved hospital, `hospitalId == auth.uid`, `existsAfter(requests/id)` with the same `hospitalId`, code matches `^[0-9]{4}$`. **read**: `resource.data.hospitalId == auth.uid` only. No update/delete.
- `orgs/{uid}` **get**: additionally allowed for an approved hospital when the target is an **approved charity** (ranking needs name, `canDeliver`, `workingHours`). Cost: the hospital can technically read that charity's other registration fields (licence no., contact email); accepted for the pilot.
- Accepted limit: rules don't verify the chosen charity really has the quantity (the phase 5 acceptance transaction will).

## Queries and indexes

- Ranking input: `collectionGroup('stock') where orgRole == 'charity' and itemId == X` (allowed by the phase 2 rule). Two equality filters on a collection group → `firestore.indexes.json` with collection-group-scope single-field indexes for `stock.itemId` and `stock.orgRole`; `npm run deploy` must also deploy `firestore:indexes`.
- Then `get` each involved charity org and warehouse doc (deduplicated).
- «طلباتي»: `requests where hospitalId == uid` (equality only), sorted on the client.

## Reverse geocoding (pin → text)

`reverseGeocode(p: LatLng): Promise<{ city?: City; district?: string }>` calling `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat&lon&zoom=16&accept-language=ar`. District from `suburb | neighbourhood | quarter | city_district`; city from `city | town | state`, mapped to one of the 8 CITIES by normalised containment — no match → city left as is. Called only when a pin is placed/moved (debounced ~600 ms, last call wins); failures are silent (fields stay editable). Never overwrites a field the user typed after the pin was placed. Used by the request form and the warehouse form.

## Services interface (additions)

```
requests: {
  watchMine(uid, cb, onError?): Unsubscribe                 // newest first
  watchOne(id, cb, onError?): Unsubscribe                    // null when missing/unreadable
  watchCode(id, cb, onError?): Unsubscribe                   // the receipt code
  loadCandidates(itemId): Promise<{ charities, warehouses, rows }>
  send(hospital: OrgRef, draft: RequestDraft, choice: { charityId, charityName, warehouseId } | null): Promise<{ id, code }>
}
```
Fake implementation mirrors the rules, as in phases 1–2.

## Constraints

- Firebase Spark; no Cloud Functions. Code generated on the client (`crypto.getRandomValues`).
- Western digits everywhere — including the date field (no Arabic-Indic digits in a native date picker; builder picks a control that shows Western digits).
- Nominatim usage policy: ≤ 1 request/second, attribution already shown on the map.
- Everything installs to D:.

## Changes after the first live test (2026-11-25, user)

- **Receipt code appears only after the charity approves.** It is still created with the request (so the hospital needn't be online at approval), but rules let the hospital read `requestSecrets/{id}` only when the request's status ≥ 2; the sent screen and details say «يظهر رمز الاستلام بعد موافقة الجمعية».
- **Phone:** digits only as typed (Arabic-Indic converted), must start with 05 and be exactly 10 digits; `+966…` is no longer converted.
- **Quantity and beneficiaries:** digits only as typed (also the stock dialog quantity).
- **Deadline:** a calendar (no typing); only days from today to the same day next year can be picked, and validation enforces the same range.

## Calls made after the builder check

- **Every request gets a receipt code at creation, open requests included** (tech plan: the code is made when the request is created so the hospital needn't be online later). The request create rule also requires `existsAfter(requestSecrets/{id})`; the open-request success screen shows the code too.
- **Indexes:** `firebase.json` gains `"indexes": "firestore.indexes.json"`; `npm run deploy` deploys `firestore:rules,firestore:indexes`. Each `fieldOverrides` entry for `stock.itemId` / `stock.orgRole` lists the default COLLECTION-scope ascending, descending and array-contains indexes plus the COLLECTION_GROUP ascending one. The emulator doesn't enforce indexes, so the live check after deploy must run a real ranking.
- **Charity org reads** are one `getDoc` per charity (a `documentId() in` query would be a list query, which stays admin-only), collected with `Promise.allSettled`; failures are dropped from the ranking.
- **`watchOne` / `watchCode`** turn permission-denied into `null` ("ما لقينا هذا الطلب").
- **Nominatim:** at most one call per second (throttle, not debounce), a sequence number so a stale answer never overwrites a newer one, results cached by coordinates rounded to 4 decimals; the default referrer policy stays (browsers can't set User-Agent).
- **"Only in the request flow"** is a UI promise, not a rule: any approved hospital can technically query charity stock. Accepted.

## Left to the builder

- Component breakdown, route guarding for charities on hospital-only pages.
- ETA wording, score bar styling, date control.
- Prefill details for «اطلب منتج ثاني».
