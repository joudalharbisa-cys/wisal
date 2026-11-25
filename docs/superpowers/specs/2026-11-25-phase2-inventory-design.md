# Phase 2 — Inventory (المخزون) Design

Status: approved in conversation 2026-11-25. Tech plan: `../../../../خطة وصال التقنية.md` (section 7, phase 2).

## Intent

Wesal matches a hospital's need to a charity's stock. Phase 3–5 (requests, ranking, reservation) need real stock data to work on. Phase 2 gives every **approved** organisation (hospital or charity) a place to record what it holds, where, and how much, and lets approved organisations see each other's stock.

Done when (tech plan): each side adds and edits its stock after approval. Plus, from this conversation: each side can see the other side's stock.

## Decisions taken by the user

| Topic | Decision |
|---|---|
| Who sees whose stock | **Option C, provisional:** every approved org sees every approved org's stock. Keep it easy to change later (rules + one page). |
| Stock structure | **Warehouses first:** an org defines warehouses (with a map location); stock lives inside a warehouse. |
| Products | **No fixed limit, any product.** A **shared product list that grows**: type a name, pick an existing match or add a new one, which becomes available to everyone. Warn when a new name is close to an existing one. |

## Approaches considered

Stock structure:
1. One row per product + condition per org, warehouse as a text label. Simplest; can't split one product across warehouses.
2. Free rows, repeats allowed. Flexible; ranking must sum rows, accidental duplicates.
3. **Warehouses first (chosen).** Most accurate: distance in phase 4 is measured from the warehouse that holds the stock. Bigger; needs a location picker now.

Products:
- A. Free-text name per row. Fast, but names diverge and phase 4 matching misses charities.
- **B. Shared growing list (chosen).** One name per product across all orgs, unlimited.

## Goals

- Approved org: create / rename / move / delete warehouses (name, city, district, map location).
- Approved org: add / edit quantity / delete stock rows inside each warehouse (product, condition new|used, quantity).
- Shared product catalogue with suggestions, add-new, near-duplicate warning; starts with the 4 prototype products.
- Approved orgs (and admins) see all approved orgs' stock on a read-only page, searchable by product.
- Security rules are the source of truth for all of the above, with rule tests.

## Non-goals (later phases)

- Reservation / deduction (`reserved` exists, always 0 here; phase 5 owns it).
- Big map of all warehouses, truck route (phase 8).
- Admin management of the product list (rename, merge, delete) — later.
- Address search / geocoding.
- Stock history, units of measure, expiry dates, photos.

## Anti-goals

- Pending or rejected orgs seeing or writing any stock.
- One org editing another org's warehouses or stock.
- Two different product docs for the exact same normalised name.
- Spoofed display data on the shared page (an org showing another org's name).

## Data model (Firestore)

```
items/{itemKey}                       shared product catalogue
  name        string 2–60 (display, as first typed)
  key         string == doc id == normalizeName(name)
  createdBy   uid
  createdAt   timestamp (request.time)

orgs/{uid}/warehouses/{whId}          auto id
  name        string 2–60
  city        one of CITIES
  district    string 1–60
  location    { lat: number 16–33, lng: number 34–56 }   (Saudi bounding box)
  createdAt, updatedAt

orgs/{uid}/stock/{stockId}            stockId = `${whId}__${itemKey}__${condition}`
  orgId, orgName, orgRole            denormalised from orgs/{uid}
  warehouseId, warehouseName, city   denormalised from the warehouse
  itemId (== itemKey), itemName      denormalised from items/{itemKey}
  condition   'new' | 'used'
  qty         int 0–99999
  reserved    int, == 0 on create, unchanged by owner updates; qty >= reserved
  updatedAt   timestamp
```

Why flat `stock` beside `warehouses` (not nested): "my stock" is one listener; the shared page and phase 4 ranking use one collection-group query on `stock`. The deterministic id makes "same product + same condition in the same warehouse" a single row: adding it again edits that row.

Seed products (`SEED_ITEMS` in code): كراسي متحركة، أجهزة تنفس، أسرّة طبية، أجهزة قياس ضغط. They appear as suggestions even before a doc exists; choosing one that has no doc yet creates it in the same batch as the stock row (same create path as any new product). No admin seeding step needed.

## Name normalisation and near-duplicates

`normalizeName(s)`: trim, collapse spaces, remove tashkeel and tatweel, أ/إ/آ→ا, ة→ه, ى→ي, drop a leading «ال» from each word, lowercase Latin. The result is the doc id (exact duplicates impossible: create fails if it exists, and the UI picks the existing one instead).

Near-duplicate (warn, user may still add): normalised names where one contains the other, or Levenshtein distance ≤ 2 when both are ≥ 4 characters. The warning reads «تقصد "كراسي متحركة"؟» with [اختره] and [لا، أضفه جديد].

## Security rules (additions)

Helpers: `isApprovedMember()` = signed in and `orgs/{auth.uid}.status == 'approved'`.

- `items/{key}`: read if approved member or admin. Create if approved member, `key == doc id`, name 2–60, `createdBy == auth.uid`, `createdAt == request.time`, keys exactly these four. No update, no delete.
- `orgs/{uid}/warehouses/{whId}`: read if approved member or admin. Create/update/delete only by owner `uid == auth.uid` who is an approved member. Field validation as in the model; keys `hasOnly`; `createdAt` set once, `updatedAt == request.time`.
- `orgs/{uid}/stock/{stockId}`: read if approved member or admin (single doc and collection-group: `match /{path=**}/stock/{id}`). Write only by owner who is approved, and:
  - `stockId == warehouseId + '__' + itemId + '__' + condition`;
  - `existsAfter` the warehouse and the item;
  - `orgName == org.name`, `orgRole == org.role`, `warehouseName`/`city == getAfter(warehouse)`, `itemName == getAfter(item).name`;
  - create: `reserved == 0`; update: `reserved` unchanged, only `qty`, `updatedAt`, `warehouseName`, `city` may change; `qty >= reserved`;
  - delete: owner, only when `reserved == 0`.
- Renaming/moving a warehouse updates its stock rows' `warehouseName`/`city` in the same batch. Deleting a warehouse deletes its stock rows in the same batch (fails if any row has `reserved > 0` — not reachable in phase 2).

Option C lives entirely in the read conditions above; switching to A or B later is a rules + page change only.

## Screens (style B identity, RTL, Western digits)

Navigation for approved members: «مخزوني» (`/app`), «مخزون الجهات» (`/app/network`). Admin nav adds «مخزون الجهات» too.

1. **مخزوني** (`/app`, replaces the phase 1 empty home)
   - No warehouses: empty state «ابدأ بإضافة أول مستودع» + gold CTA.
   - One card per warehouse: name, city · district, [تعديل]; stock table (المنتج، الحالة badge، الكمية) with per-row [تعديل] [حذف]; [+ منتج] in the card.
   - Header action: [+ مستودع].
2. **Warehouse form** (`/app/warehouses/new`, `/app/warehouses/:id`) — a page, not a dialog, because of the map.
   - Name, city (select), district, map with a draggable pin, [موقعي الحالي] (browser geolocation). Map centres on the chosen city until a pin is placed. Save disabled until a pin exists. Edit page also has [حذف المستودع] with confirm (says how many stock rows go with it).
   - Map: Leaflet + react-leaflet, OpenStreetMap tiles with attribution, no API key.
3. **Stock dialog** (add / edit) inside مخزوني.
   - Product combobox: typing shows matches from catalogue + seeds; last option «أضف "..." كمنتج جديد»; near-duplicate warning before adding new. Condition: ChoiceGroup جديد / مستعمل. Quantity: number.
   - Editing an existing row: product and condition are fixed (they are the row's identity), only quantity changes. If the user adds a product+condition that already exists in that warehouse, the dialog says so and edits that row's quantity.
4. **مخزون الجهات** (`/app/network`)
   - Search by product (same normalisation). Rows grouped by org: org name + role badge (مستشفى / جمعية) + city; under it warehouse name, product, condition, available (`qty − reserved`). Own org shown too, marked «أنت». Read-only. Empty state when nothing matches.

Each phase step 1 (tech plan): these screens get designed on the identity and shown to the user as screenshots before the real wiring is finalised.

## Services interface (additions)

```
inventory: {
  watchItems(cb): Unsubscribe
  watchMyWarehouses(uid, cb): Unsubscribe
  watchMyStock(uid, cb): Unsubscribe
  watchAllStock(cb): Unsubscribe                     // collection group
  saveWarehouse(uid, id | null, draft): Promise<string>   // batch-updates stock denormals on rename/move
  deleteWarehouse(uid, id): Promise<void>                 // batch-deletes its stock
  upsertStock(org, warehouse, item | newItemName, condition, qty): Promise<void>  // creates item in same batch if needed
  deleteStock(uid, stockId): Promise<void>
}
```
Fake implementation mirrors the rules, as in phase 1.

## Constraints

- Firebase Spark (free); no Cloud Functions. Everything client + rules.
- All installs/caches on D: (project-local `node_modules`, `.firebase-emulators`).
- Arabic UI copy, casual-polite tone as in phase 1; Western digits.
- TDD; rules tests on the emulator; one integration test of the real services.
- Collection-group query on `stock` needs no composite index (no filters/orderBy beyond what single-field indexes cover); phase 4 will add `firestore.indexes.json` if it filters by `itemId`.

## Left to the builder

- Exact component breakdown, file names, and dialog implementation.
- Levenshtein implementation details; exact normalisation table beyond the list above.
- City centre coordinates for the 8 cities.
- Loading/error states, following phase 1 patterns (Alert, Spinner, Guard retry screen).
