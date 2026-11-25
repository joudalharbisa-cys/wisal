# Phase 2 — Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approved hospitals and charities manage warehouses (with a map location) and the stock inside them, using a shared growing product list, and see every approved org's stock.

**Architecture:** Pure domain helpers in `src/features/inventory/` (names, validation, ids). Security rules for `items`, `orgs/{uid}/warehouses`, `orgs/{uid}/stock` (+ collection-group read) are the source of truth. A new `inventory` section on the `Services` interface, with a Firebase implementation (transactions/batches) and an in-memory fake that mirrors the rules. Screens follow the approved spike on branch `phase2-screens` (`src/preview/inventory/*`) — copy its markup, not its static data.

**Tech Stack:** React 19, TypeScript, Tailwind v4 tokens, react-router-dom 7, Firebase 12 (Firestore), leaflet 1.9.4 + react-leaflet 5, Vitest + Testing Library, @firebase/rules-unit-testing on the emulator.

**Spec:** `docs/superpowers/specs/2026-11-25-phase2-inventory-design.md`

## Global Constraints

- Firebase Spark only; no Cloud Functions. All writes from the client, guarded by rules.
- Everything installs to D: (project `node_modules`, `.firebase-emulators`, npm cache `D:\npm-cache`).
- Arabic UI copy, RTL, **Western digits everywhere** (no `type="number"` inputs — Chromium renders Arabic-Indic digits in an Arabic page; use `inputMode="numeric" dir="ltr"`).
- Approved orgs only: pending/rejected orgs can't read or write any inventory data.
- `qty` integer 0–99999; `reserved` is 0 on create and never changed by owners.
- Warehouse `location` inside the Saudi box: lat 16–33, lng 34–56.
- Stock id `${warehouseId}__${itemKey}__${condition}`; item key contains no `/` and no `__`.
- Seed products: كراسي متحركة، أجهزة تنفس، أسرّة طبية، أجهزة قياس ضغط.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Quantity typed with Arabic-Indic digits («٢٠») → saved as 20, not rejected. (Task 1 `parseQty` test.)
2. Same product + same condition added twice in one warehouse → the existing row's quantity is replaced, no duplicate row, no rules failure. (Task 3 fake test, Task 4 integration test.)
3. A seed product picked before any org has used it, then picked again by a second org → first call creates the item doc, the second reuses it without failing. (Task 4 integration test.)
4. Renaming a warehouse that holds 25 stock rows → succeeds (batch access-call limit). (Task 2 rules test.)
5. «موقعي الحالي» when location permission is denied/unavailable → clear message, manual pin still works. (Task 8 test.)

---

### Task 1: Inventory domain helpers

**Files:**
- Create: `src/features/inventory/types.ts`, `src/features/inventory/names.ts`, `src/features/inventory/validate.ts`
- Modify: `src/features/orgs/cities.ts` (add `CITY_CENTERS`)
- Test: `tests/unit/inventory-domain.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Condition = 'new' | 'used'
  export type LatLng = { lat: number; lng: number }
  export type Item = { key: string; name: string }
  export type ItemChoice = { kind: 'existing'; item: Item } | { kind: 'new'; name: string }
  export type WarehouseDraft = { name: string; city: string; district: string; location: LatLng | null }
  export type Warehouse = { id: string; name: string; city: string; district: string; location: LatLng; createdAt: Date; updatedAt: Date }
  export type StockRow = { id: string; orgId: string; orgName: string; orgRole: OrgRole; warehouseId: string; warehouseName: string; city: string;
    itemId: string; itemName: string; condition: Condition; qty: number; reserved: number; updatedAt: Date }
  export type OrgRef = { uid: string; name: string; role: OrgRole }
  export const CONDITION_LABEL: Record<Condition, string>   // جديد / مستعمل
  ```
- Produces (`names.ts`): `normalizeName(s: string): string`, `isNearDuplicate(a: string, b: string): boolean` (inputs raw, normalises inside), `findNearDuplicate(name: string, items: Item[]): Item | null` (ignores an exact key match), `SEED_ITEMS: Item[]`, `mergeItems(db: Item[]): Item[]` (db ∪ seeds by key, sorted by name with `localeCompare('ar')`), `isValidItemKey(k: string): boolean`, `stockId(warehouseId: string, itemKey: string, c: Condition): string`.
- Produces (`validate.ts`): `parseQty(s: string): number | null`, `validateWarehouse(d: WarehouseDraft): Partial<Record<'name'|'city'|'district'|'location', string>>`, `inSaudiBox(p: LatLng): boolean`.
- Produces (`cities.ts`): `CITY_CENTERS: Record<(typeof CITIES)[number], LatLng>` — الرياض 24.7136,46.6753 · جدة 21.5433,39.1728 · مكة المكرمة 21.3891,39.8579 · المدينة المنورة 24.5247,39.5692 · الدمام 26.4207,50.0888 · الطائف 21.2703,40.4158 · أبها 18.2164,42.5053 · تبوك 28.3835,36.5662.

- [ ] **Step 1: Write the failing tests**

```ts
it('normalises Arabic product names', () => {
  expect(normalizeName('  الكراسي   المتحركة ')).toBe('كراسي متحركه')
  expect(normalizeName('أجهزة إسعاف')).toBe('اجهزه اسعاف')
  expect(normalizeName('كـراسيّ')).toBe('كراسي')          // tatweel + shadda
  expect(normalizeName('مستشفى')).toBe('مستشفي')
  expect(normalizeName('CPAP  Machine')).toBe('cpap machine')
  expect(normalizeName('الم')).toBe('الم')                 // «ال» kept when < 2 letters would remain
})
it('flags near duplicates', () => {
  expect(isNearDuplicate('كرسي متحرك', 'كراسي متحركة')).toBe(true)   // distance 2
  expect(isNearDuplicate('كراسي', 'كراسي متحركة')).toBe(true)        // containment
  expect(isNearDuplicate('أجهزة تنفس', 'أسرّة طبية')).toBe(false)
  expect(findNearDuplicate('كرسي متحرك', SEED_ITEMS)?.name).toBe('كراسي متحركة')
  expect(findNearDuplicate('الكراسي المتحركة', SEED_ITEMS)).toBeNull() // exact key = not "near"
})
it('builds stock ids and checks item keys', () => {
  expect(stockId('w1', 'كراسي متحركه', 'new')).toBe('w1__كراسي متحركه__new')
  expect(isValidItemKey('a/b')).toBe(false)
  expect(isValidItemKey('a__b')).toBe(false)
  expect(isValidItemKey('كراسي متحركه')).toBe(true)
})
it('parses quantities with Western or Arabic-Indic digits', () => {
  expect(parseQty('20')).toBe(20)
  expect(parseQty('٢٠')).toBe(20)
  expect(parseQty(' 0 ')).toBe(0)
  for (const bad of ['', '-1', '1.5', '100000', 'abc']) expect(parseQty(bad)).toBeNull()
})
it('validates warehouse drafts', () => {
  const ok = { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.62, lng: 39.15 } }
  expect(validateWarehouse(ok)).toEqual({})
  expect(validateWarehouse({ ...ok, location: null }).location).toBe('حدد موقع المستودع على الخريطة')
  expect(validateWarehouse({ ...ok, location: { lat: 40, lng: 39 } }).location).toBe('الموقع لازم يكون داخل السعودية')
  expect(validateWarehouse({ ...ok, name: 'م' }).name).toBe('اكتب اسم المستودع (حرفين على الأقل)')
  expect(validateWarehouse({ ...ok, city: 'دبي' }).city).toBe('اختر المدينة')
  expect(validateWarehouse({ ...ok, district: ' ' }).district).toBe('اكتب الحي')
  expect(mergeItems([{ key: 'عكازات', name: 'عكازات' }]).length).toBe(5)
})
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/inventory-domain.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Normalise: NFKC-free manual map; strip `[\u064B-\u0652\u0640]`; أإآ→ا, ة→ه, ى→ي; per word drop leading «ال» if ≥ 2 letters remain; collapse spaces; lowercase. Near-duplicate: equal, or shorter (≥ 3 chars) contained in longer, or both ≥ 4 chars and Levenshtein ≤ 2. Names 2–60 chars (trimmed) are enforced by callers via `validateItemName(s): string | undefined` → «اسم المنتج من 2 إلى 60 حرف» (add to `validate.ts` with a test line `expect(validateItemName('ك')).toBeDefined()`).
- [ ] **Step 4: Run** the test file — Expected: PASS. Then `npm test` — all green.
- [ ] **Step 5: Commit** `feat(inventory): domain types, name normalisation, validation`.

---

### Task 2: Security rules for items, warehouses, stock

**Files:**
- Modify: `firestore.rules`
- Test: `tests/rules/inventory.rules.test.ts` (same harness as `orgs.rules.test.ts`: `seed()` with rules disabled, compat SDK)

**Interfaces:**
- Consumes: data shapes from Task 1 and the spec's rules section.
- Produces: rules the services in Tasks 3–4 must satisfy:
  - `items/{key}` create: keys exactly `name,key,createdBy,createdAt`; `key == docId`; key valid (no `/`, no `__`); name 2–60; `createdBy == auth.uid`; `createdAt == request.time`. Read: approved member or admin. No update/delete.
  - `orgs/{uid}/warehouses/{whId}`: read approved/admin; create/update/delete owner+approved; keys `name,city,district,location,createdAt,updatedAt`; city in the 8 cities; `location` keys exactly `lat,lng`, numbers in the box; `createdAt` == request.time on create and unchanged on update; `updatedAt == request.time`.
  - `orgs/{uid}/stock/{id}` and `match /{path=**}/stock/{id}` read: approved/admin. Create/update/delete exactly as the spec's rules section (update reads org? no — only `getAfter(warehouse)`; create reads org, warehouse, item).

Helper: `function isApprovedMember() { return signedIn() && get(/databases/$(database)/documents/orgs/$(request.auth.uid)).data.status == 'approved'; }`.

- [ ] **Step 1: Write the failing tests** (names are the contract; each uses an approved `h1` hospital org seeded with rules disabled, a pending `p1` org, and an approved `c1` charity):
  - items: `approved org creates a valid product`, `pending org cannot create a product`, `key must equal doc id`, `key with "__" is rejected`, `extra field is rejected`, `nobody can update or delete a product`, `approved org reads products`, `pending org cannot read products`.
  - warehouses: `owner creates a valid warehouse`, `cannot create in another org`, `pending owner cannot create`, `location outside Saudi box is rejected`, `unknown city is rejected`, `owner renames warehouse`, `createdAt cannot change`, `owner deletes warehouse`, `other approved org reads warehouse`, `pending org cannot read warehouses`.
  - stock: `owner creates a valid row` (warehouse + item already exist), `creates item and row in one batch`, `wrong stock id is rejected`, `reserved must start at 0`, `spoofed orgName is rejected`, `itemName must match the item`, `missing warehouse is rejected`, `owner updates qty`, `qty below 0 or above 99999 is rejected`, `itemName cannot change on update`, `reserved cannot change on update`, `other org cannot write`, `deletes warehouse and its rows in one batch`, `renames a warehouse holding 25 rows in one batch` (25 rows, each a different item; batch updates warehouse name + every row's `warehouseName`), `approved org reads all stock via collection group`, `pending org cannot read stock via collection group`.
- [ ] **Step 2: Run** `npm run test:rules` — Expected: new tests FAIL (deny-by-default), old tests PASS.
- [ ] **Step 3: Implement the rules** per Interfaces. Key-format regex: `k.matches('^[^/]+$') && !k.matches('.*__.*')`.
- [ ] **Step 4: Run** `npm run test:rules` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(rules): inventory — products, warehouses, stock`.

---

### Task 3: Services interface + fake inventory

**Files:**
- Modify: `src/services/types.ts`, `src/services/fakeServices.ts`
- Test: `tests/unit/fake-inventory.test.ts`

**Interfaces:**
- Produces on `Services`:
  ```ts
  inventory: {
    watchItems(cb: (items: Item[]) => void): Unsubscribe                       // db items only; UI merges seeds
    watchWarehouses(uid: string, cb: (w: Warehouse[]) => void): Unsubscribe     // sorted by createdAt
    watchStock(uid: string, cb: (rows: StockRow[]) => void): Unsubscribe
    watchAllStock(cb: (rows: StockRow[]) => void, onError?: (e: ServiceError) => void): Unsubscribe
    saveWarehouse(owner: OrgRef, id: string | null, draft: WarehouseDraft & { location: LatLng }): Promise<string>
    deleteWarehouse(uid: string, id: string): Promise<void>
    setStock(owner: OrgRef, warehouse: Warehouse, choice: ItemChoice, condition: Condition, qty: number): Promise<void>
    deleteStock(uid: string, stockId: string): Promise<void>
  }
  ```
  `setStock` semantics: resolve item key = `choice.kind === 'existing' ? choice.item.key : normalizeName(choice.name)`; create the item if missing (name = `choice.item.name` or trimmed `choice.name`); if the row exists, replace `qty` only; else create with `reserved: 0`.
- Fake `Seed` gains `items?: Item[]`, `warehouses?: Record<uid, Warehouse[]>`, `stock?: StockRow[]`, `failures.allStock?: boolean`. Fake throws `ServiceError('invalid-transition')` when the caller's org is not approved, qty out of range, or warehouse missing.

- [ ] **Step 1: Write the failing tests:** `approved org saves a warehouse and sees it`, `pending org cannot save a warehouse`, `setStock with a new name creates the product for everyone`, `same product and condition twice replaces the quantity` (expect one row, qty = second value), `renaming a warehouse updates its rows' warehouseName`, `deleting a warehouse removes its rows`, `watchAllStock lists rows of every org`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/fake-inventory.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the fake (emit to watchers after each change, like `emitOrg`). Stub `inventory` in `createFirebaseServices` with methods that throw `ServiceError('unknown')` so the build passes until Task 4.
- [ ] **Step 4: Run** `npm test` and `npm run build` — Expected: PASS / no type errors.
- [ ] **Step 5: Commit** `feat(services): inventory interface and in-memory fake`.

---

### Task 4: Firebase inventory services

**Files:**
- Modify: `src/services/firebaseServices.ts`
- Test: `tests/integration/firebaseServices.test.ts` (add a `describe('inventory')`)

**Interfaces:**
- Consumes: Task 3 interface, Task 2 rules.
- Implementation notes: `setStock` uses `runTransaction` (read item + row; create item if missing; `set` row on create / `update` `{qty, updatedAt}` on existing). `saveWarehouse` with an id: `writeBatch` updating the warehouse and every row of that org with `warehouseId == id` (`warehouseName`, `city`, `updatedAt`). `deleteWarehouse`: batch delete warehouse + its rows. `watchAllStock`: `collectionGroup(db,'stock')`. All writes `serverTimestamp()`; errors through `wrap()`.

- [ ] **Step 1: Write the failing integration tests:** `approved hospital stores a warehouse and a new product`, `second org reuses a seed product created by the first`, `same product and condition twice keeps one row with the new qty`, `rename updates rows; delete removes rows`, `watchAllStock returns rows from both orgs`. (Approve orgs by seeding `orgs/{uid}` with `status: 'approved'` through the admin path already used in this file.)
- [ ] **Step 2: Run** `npm run test:integration` — Expected: FAIL (stubs throw).
- [ ] **Step 3: Implement** per notes.
- [ ] **Step 4: Run** `npm run test:integration` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(services): Firebase inventory (transactions, batches, collection group)`.

---

### Task 5: Shared UI — Dialog, badges, stat

**Files:**
- Create: `src/components/ui/Dialog.tsx`, `src/components/ui/Stat.tsx`
- Modify: `src/components/ui/Badge.tsx` (add `ConditionBadge`, `RoleBadge`)
- Test: `tests/unit/ui.test.tsx`

**Interfaces:**
- `Dialog({ title, sub?, icon?, onClose, footer, children })` — `role="dialog"`, `aria-modal`, labelled by title, Escape and backdrop click call `onClose`, close button «إغلاق». Markup from spike `StockDialog.tsx`.
- `ConditionBadge({ condition: Condition })`, `RoleBadge({ role: OrgRole })` — classes from spike `parts.tsx`.
- `Stat({ label, value, icon })` — from spike.

- [ ] **Step 1: Tests:** `dialog closes on Escape`, `dialog is labelled by its title`, `condition badge reads جديد / مستعمل`, `role badge reads مستشفى / جمعية`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/ui.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ui): dialog, condition/role badges, stat`.

---

### Task 6: ProductPicker + StockDialog

**Files:**
- Create: `src/features/inventory/ProductPicker.tsx`, `src/features/inventory/StockDialog.tsx`
- Test: `tests/unit/stock-dialog.test.tsx`

**Interfaces:**
- `ProductPicker({ items: Item[]; value: ItemChoice | null; onChange(c: ItemChoice | null): void; error?: string })` — input `role="combobox"` labelled «المنتج», listbox of `mergeItems`-filtered matches (normalised contains), last option «أضف «X» كمنتج جديد» when no exact key match. Picking add-new with a near duplicate shows «فيه منتج قريب من هذا الاسم. تقصد «Y»؟» with [نعم، اختره] → existing Y, [لا، أضفه كمنتج جديد] → new.
- `StockDialog({ warehouse: Warehouse; rows: StockRow[]; items: Item[]; editing?: StockRow; onClose(); onSave(choice: ItemChoice, condition: Condition, qty: number): Promise<void> })` — add mode: picker + ChoiceGroup «الحالة» + «الكمية» (`inputMode="numeric" dir="ltr"`). Edit mode: product and condition shown read-only, only qty. If chosen product+condition already exists in `rows`: note «موجود في هذا المستودع بكمية N، الكمية الجديدة تحل محلها». Errors: «اختر المنتج», «اكتب الكمية بالأرقام من 0 إلى 99999». Save failure → Alert «ما قدرنا نحفظ، حاول مرة ثانية».

- [ ] **Step 1: Tests:** `typing shows matching products`, `adds a new product after declining the suggestion`, `accepting the suggestion picks the existing product`, `rejects a missing product and a bad quantity`, `accepts Arabic-Indic digits`, `edit mode only changes quantity`, `warns when the product and condition already exist`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(inventory): product picker with near-duplicate check, stock dialog`.

---

### Task 7: «مخزوني» page

**Files:**
- Create: `src/pages/app/MyStock.tsx`
- Delete: `src/pages/app/MemberHome.tsx` (route `/app` → `MyStock`)
- Modify: `src/App.tsx`, `src/layout/AppShell.tsx` (member nav «مخزوني» `/app` with `end`, «مخزون الجهات» `/app/network`)
- Test: `tests/unit/my-stock.test.tsx` (replace any MemberHome test)

**Interfaces:**
- Consumes: `useCurrentSession()` (approved member), `services.inventory.watchWarehouses/watchStock/watchItems/setStock/deleteStock`, Task 5–6 components.
- Markup from spike `MyStock.tsx` (stats, warehouse cards, empty state «ابدأ بإضافة أول مستودع», «نفد» for 0). [+ مستودع جديد] → `/app/warehouses/new`; [تعديل المستودع] → `/app/warehouses/:id`. Delete row asks in a Dialog «حذف «كراسي متحركة · جديد» من المستودع الرئيسي؟».

- [ ] **Step 1: Tests:** `shows the empty state with no warehouses`, `lists warehouses with their rows and totals`, `zero quantity reads نفد`, `adds a product through the dialog`, `deletes a row after confirming`, `nav shows مخزوني and مخزون الجهات`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test`).
- [ ] **Step 5: Commit** `feat(inventory): my stock page`.

---

### Task 8: Warehouse form with map

**Files:**
- Create: `src/features/inventory/LocationMap.tsx` (react-leaflet; spike `WarehouseForm.tsx` pin + tiles; props `{ center: LatLng; value: LatLng | null; onChange(v: LatLng) }`; click on map or drag pin → `onChange`), `src/features/inventory/geo.ts` (`getCurrentLocation(): Promise<LatLng>` rejecting with `ServiceError('unknown')` when unavailable/denied), `src/pages/app/WarehouseForm.tsx`
- Modify: `src/App.tsx` (`/app/warehouses/new`, `/app/warehouses/:id`)
- Test: `tests/unit/warehouse-form.test.tsx` (mock `LocationMap` with `vi.mock` — jsdom has no layout; the mock renders a button «ضع الدبوس» that calls `onChange({lat:21.62,lng:39.15})`)

**Interfaces:**
- Consumes: `validateWarehouse`, `CITY_CENTERS`, `services.inventory.saveWarehouse/deleteWarehouse/watchWarehouses/watchStock`.
- Page: fields اسم المستودع / المدينة / الحي, map centred on `CITY_CENTERS[city]` until a pin exists, [موقعي الحالي] outside the map container (top-start overlay), coordinates readout, [حفظ المستودع]. Edit page: [حذف المستودع] → Dialog «حذف المستودع ومعه N منتج؟». Unknown id → «ما لقينا هذا المستودع» + link «رجوع لمخزوني». Geolocation failure → Alert «ما قدرنا نحدد موقعك، حرّك الدبوس يدويًا».

- [ ] **Step 1: Tests:** `saves a new warehouse and returns to مخزوني`, `shows validation messages`, `my location fills the pin`, `denied location shows a message and keeps manual pin`, `edit page deletes after confirming with the row count`, `unknown warehouse id shows not found`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(inventory): warehouse form with map location`.

---

### Task 9: «مخزون الجهات» page

**Files:**
- Create: `src/pages/app/Network.tsx`
- Modify: `src/App.tsx` (`/app/network`, `/admin/network`), `src/layout/AppShell.tsx` (admin nav adds «مخزون الجهات» `/admin/network`; `/admin` link gets `end`)
- Test: `tests/unit/network.test.tsx`

**Interfaces:**
- Consumes: `services.inventory.watchAllStock`, `normalizeName`, `RoleBadge`, `ConditionBadge`.
- Rows with `qty − reserved > 0` only; search box «ابحث بالمنتج» filters by normalised contains on `itemName`; grouped by `orgId`, own org first with «أنت», others by name; summary «N قطعة متاحة عند M جهات»; empty «ما فيه مخزون يطابق بحثك». Listener error → Alert «تعذّر تحميل المخزون».

- [ ] **Step 1: Tests:** `groups rows by org with role badges`, `own org comes first marked أنت`, `hides rows with nothing available`, `search matches normalised names` (both «كراسي» and «الكراسي» find «كراسي متحركة»; «أجهزة» finds «اجهزه تنفس» stored as «أجهزة تنفس»), `admin sees the page at /admin/network`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(inventory): network stock page`.

---

### Task 10: Seed, docs, end-to-end, deploy

**Files:**
- Modify: `scripts/seed-emulator.mjs` (two approved orgs with one warehouse each and a few rows), `README.md` (phase 2 notes)

- [ ] **Step 1:** `npm test`, `npm run test:rules`, `npm run test:integration`, `npm run build`, `npm run lint` — all PASS / clean.
- [ ] **Step 2:** Emulators + `npm run seed:emulator` + dev server: walk the flow in the browser pane — empty state → add warehouse with map → add seed product → add new product with near-duplicate warning → edit qty → see it in «مخزون الجهات» from the other org → rename warehouse → delete row → delete warehouse.
- [ ] **Step 3: Commit** `docs: phase 2 seed data and README`.
- [ ] **Step 4:** Final whole-branch review (fresh reviewer), fix pass.
- [ ] **Step 5:** `npm run deploy` (rules + hosting) after the user agrees; push branch `phase-2`.
