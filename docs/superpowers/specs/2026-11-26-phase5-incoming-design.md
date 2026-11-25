# Phase 5 — Charity incoming requests (الطلبات الواردة) Design

Status: started 2026-11-26 at the user's request («أ و ابدا بتطوير المرحلة القادمة»). Tech plan: `../../../../خطة وصال التقنية.md` §6 (statuses, reservation) and §7 phase 5 («الجمعية تقبل وتحجز، أو ترفض فيرجع الطلب، والطلبات المفتوحة تشتغل»). Builds on phase 3+4 (`2026-11-25-phase3-requests-design.md`).

## Intent

Hospitals can now send requests, but the charity can't see them. This phase gives charities the other half: see requests sent to them, accept (which reserves the stock and reveals the receipt code to the hospital) or reject, and take open requests they can cover. When a charity rejects, the hospital chooses again.

## Decisions taken by the user

| Topic | Decision |
|---|---|
| Rejection | **Option أ:** the request goes back to the hospital («رفضت الجمعية …»); the hospital picks another charity from the ranking, and the charity that rejected never appears again for that request. (Tech plan: back to status 0, charity added to `excluded`.) |
| Receipt code | (Phase 3 change) the hospital sees it only after a charity accepts (status ≥ 2). |
| Stock visibility | Charities never see hospital stock; they see only requests addressed to them, their accepted ones, and open requests. |

## Approaches considered (rejection)

- أ (chosen) back to the hospital to choose again — the hospital keeps control, same as the first send.
- ب automatic hand-over to the next ranked charity — faster, but the hospital may end up with a charity it didn't pick.
- ج becomes an open request — simple, but the hospital loses the choice.

## Goals

- Charity home becomes «الطلبات الواردة» (`/app`), «مخزوني» moves to `/app/stock` (same as hospitals). Hospital nav unchanged.
- Three tabs on the charity page:
  - **لك** — requests sent to this charity, waiting for its answer (status 1).
  - **مفتوحة** — open requests (status 0) the charity can cover from **one** of its warehouses (same rule as the ranking), and is not in `excluded` for.
  - **قبلتها** — requests this charity accepted (status ≥ 2).
- Request page for the charity (`/app/incoming/:id`): hospital, product · qty, accepted condition, priority, deadline, beneficiaries, delivery place (city، district · details) and its distance from the charity's warehouse; receiver name/phone shown **after** acceptance.
  - **قبول**: for a sent request, from the warehouse the hospital chose; for an open request, from the charity's best suitable warehouse (nearest). A transaction checks availability and reserves.
  - **رفض** (only for status 1): confirm dialog with an optional reason (≤ 200 chars).
- Hospital side:
  - «طلباتي» and the request page show a rejected request as «رفضت جمعية X» (+ reason) with [اختر جمعية ثانية] → the ranking step (excluded charities removed) → send (status 1 again) or publish as open (stays 0).
  - When accepted: status «تمت الموافقة» and the receipt code appears (phase 3 rule).
- Badge counts: the charity nav shows how many requests wait in «لك».

## Non-goals

- Charity response timeout (open question in the tech plan; later).
- Partial delivery / splitting a request across charities.
- Meeting link, delivery steps, code entry (phases 6–7).
- Push/email notifications (phase 9). "Notification" here means the hospital's pages update live.
- Hospital cancelling a request.

## Anti-goals

- A charity reading requests not addressed to it (except open ones), or another charity's accepted request.
- A charity accepting more than it has available; two charities both "accepting" the same open request.
- A charity that rejected a request seeing or getting it again.
- Charities reading receipt codes.

## Status transitions (tech plan §6)

| From → To | Who | Writes |
|---|---|---|
| 1 → 2 accept | the addressed charity | `status 2`, `reservation {stockId: qty}`, `acceptedAt`, `updatedAt`; stock rows `reserved += qty` in the same transaction |
| 1 → 0 reject | the addressed charity | `status 0`, remove `charityId/charityName/warehouseId`, `excluded += [uid]`, `lastRejection {charityName, reason, at}`, `updatedAt` |
| 0 → 2 take open | an approved charity not in `excluded` | `status 2`, `charityId/charityName/warehouseId` (own), `reservation`, `acceptedAt`, `updatedAt`; stock rows `reserved += qty` |
| 0 → 1 choose again | the hospital | `status 1`, `charityId/charityName/warehouseId` (approved charity not in `excluded`), `updatedAt` |

Reservation (accept/take): read the request and the warehouse's rows for `itemId` inside a transaction; available = Σ(qty − reserved) over accepted conditions; fail with «الكمية ما تكفي الحين» if short; take from `new` first, then `used` (when accepted); write each row's `reserved` and the request's `reservation` map. The transaction re-check means two charities racing for an open request can't both win (the second sees status 2 and fails with «أخذته جمعية ثانية»).

## Data model changes

```
requests/{id}
  + reservation   map stockId → int   (set on accept)
  + acceptedAt    timestamp
  + lastRejection { charityName, reason (0–200), at }   (set on reject; kept until the next send)
```
Stock rows: owners may now change `reserved` (0 ≤ reserved ≤ qty) — it's their own stock; previously frozen.

## Security rules (changes)

- `requests` **read**: owner hospital; admin; the addressed charity (`resource.data.charityId == uid`); any approved charity when `status == 0` (open). Charity list queries must filter (`charityId == uid`, or `status == 0`).
- `requests` **update**:
  - charity accept: `resource.status == 1 && resource.charityId == uid` → `status 2`; changed keys ⊆ `status, reservation, acceptedAt, updatedAt`; `reservation` is a map; timestamps == request.time.
  - charity reject: `resource.status == 1 && resource.charityId == uid` → `status 0`; charity fields removed; `excluded == resource.excluded.concat([uid])`; `lastRejection` well-formed with `charityName == resource.charityName`; changed keys ⊆ `status, charityId, charityName, warehouseId, excluded, lastRejection, updatedAt`.
  - charity take open: `resource.status == 0`, approved charity, `!(uid in resource.excluded)` → `status 2`, `charityId == uid`, `charityName == own name`, own `warehouseId` exists; changed keys ⊆ `status, charityId, charityName, warehouseId, reservation, acceptedAt, updatedAt, lastRejection`(removed).
  - hospital choose again: owner, `resource.status == 0` → `status 1` with an approved charity not in `excluded` (same checks as create); changed keys ⊆ `status, charityId, charityName, warehouseId, updatedAt, lastRejection`(removed).
- `stock` update: `reserved` may change, `0 <= reserved <= qty`; other phase 2 checks unchanged.
- `requestSecrets` unchanged (hospital reads at status ≥ 2).

Rules don't cross-check that `reserved` deltas equal the reservation map (a charity only affects its own stock); accepted.

## Services interface (additions)

```
requests: {
  ...phase 3
  watchIncoming(uid, cb, onError?): Unsubscribe        // status 1 addressed to me + status ≥2 mine (charityId == uid)
  watchOpen(cb, onError?): Unsubscribe                 // status 0
  watchForCharity(id, cb, onError?): Unsubscribe       // one request as a charity; null when not readable
  accept(charity: OrgRef, requestId, warehouseId?): Promise<void>   // open: warehouseId of own best warehouse
  reject(charity: OrgRef, requestId, reason): Promise<void>
  resend(hospital: OrgRef, requestId, choice: CharityChoice): Promise<void>
}
```

## Screens (style B, RTL, Western digits)

1. **الطلبات الواردة** (charity `/app`): tabs لك (count) / مفتوحة / قبلتها. Rows: hospital, product · qty, priority badge, deadline, distance from my nearest suitable warehouse, status. Empty states per tab.
2. **طلب وارد** (`/app/incoming/:id`): details + map-less place text + distance; sticky action bar [قبول] [رفض] for status 1, [أقبل الطلب] for open; after acceptance: «قبلت الطلب، الكمية محجوزة من <warehouse>» + receiver name/phone. Reject dialog with optional reason.
3. **Hospital request page** (existing): rejected banner «رفضت <charity> الطلب» (+ reason) with [اختر جمعية ثانية] → ranking (excluded removed) → [أرسل]; accepted shows the code.
4. **مخزوني** shows reserved quantities: «40 (محجوز 40)» style column «المحجوز».

## Constraints

- Spark; transactions on the client; Western digits; Arabic copy.
- The open-requests query is `status == 0` (single equality, no index needed); charity-side filtering by stock happens on the client.

## Left to the builder

- Exact copy for empty states and errors, tab component, distance formatting reuse (`formatKm`).
