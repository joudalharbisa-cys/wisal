# Phase 5 — Charity Incoming Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charities see requests sent to them and open requests, accept (reserving stock) or reject; a rejected request waits for the hospital to choose again or publish it as open.

**Architecture:** Extend phase 3 data (`open` flag, `requestContacts` doc), add pure reservation/warehouse helpers, rules for each transition, new `requests` service methods (Firebase transactions + fake), charity pages, and hospital re-choose. Screens follow the approved spike on branch `phase5-screens` (`src/preview/incoming/*`).

**Tech Stack:** as phase 3.

**Spec:** `docs/superpowers/specs/2026-11-26-phase5-incoming-design.md`

## Global Constraints

- Spark; transactions on the client; stock rows read by id inside transactions (`${wh}__${item}__new|used`).
- Charities read: requests addressed to them (`charityId == uid`) and open ones (`status == 0 && open == true`). Receiver name/phone live in `requestContacts/{id}` (hospital; accepting charity at status ≥ 2).
- A charity that rejected may still take the request (no `excluded` check); the hospital's re-ranking marks it «رفضت الطلب قبل».
- Reserve new first, then used (when `accept == 'any'`). Message when short: «الكمية ما تكفي الحين». Lost race / lost access: «أخذته جمعية ثانية».
- Status copy: 0 + open → «طلب مفتوح»; 0 + not open → «بانتظار قرارك» (hospital) ; 1 «بانتظار موافقة الجمعية»; 2 «تمت الموافقة».
- Western digits; Arabic copy; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Two charities accept the same open request at once → exactly one wins; the other sees «أخذته جمعية ثانية» and its stock is untouched. (Task 4 integration test.)
2. Accept with `accept: 'any'` and 30 new + 20 used for 40 → reserves 30 new + 10 used; `qty` unchanged, `reserved` rises. (Task 3 + 4 tests.)
3. A charity opening a request addressed to another charity, or a non-open status-0 request → «ما لقينا هذا الطلب», never the receiver. (Tasks 2, 6 tests.)
4. Rejected request: not visible in any charity's open list until the hospital publishes it. (Tasks 2, 4 tests.)
5. Deleting a stock row or warehouse that has reserved quantity → clear message, nothing deleted. (Task 7 test.)

---

### Task 1: Phase 3 data — `open` flag and `requestContacts`

**Files:** Modify `src/features/requests/types.ts` (HospitalRequest: `open: boolean`, `excluded: string[]`, optional `lastRejection {charityName, reason, at: Date}`, `reservation?: Record<string, number>`, `acceptedAt?: Date`; **remove** `receiver`; add `type Contact = { name: string; phone: string }`), `src/services/types.ts` (`watchContact(id, cb, onError?)`), `fakeServices.ts`, `firebaseServices.ts` (`send` writes `open: !choice` and `requestContacts/{id}` `{hospitalId, name, phone}` in the batch; `watchContact` maps permission-denied → null), `firestore.rules` (create requires `open` bool == (status == 0), no `receiver`; `requestContacts` create paired with the request (`existsAfter` both ways, phone regex); read by owner hospital, or by `get(request).charityId == uid && status >= 2`), `RequestDetails.tsx` (receiver via `watchContact`). Tests: update `tests/rules/requests.rules.test.ts`, `tests/unit/fake-requests.test.ts`, `tests/integration/requests.test.ts`, `tests/unit/my-requests.test.tsx`, `tests/unit/new-request.test.tsx` to the new shape; new rules tests `contact is paired with its request`, `other hospital and charities cannot read the contact`.

- [ ] Steps: tests first (FAIL) → implement → `npm test`, `npm run test:rules`, `npm run test:integration` PASS → commit `feat(requests): open flag and private receiver contact`.

### Task 2: Rules — charity reads and transitions, stock reserved

**Files:** `firestore.rules`; tests `tests/rules/incoming.rules.test.ts`.

Rules per spec "Security rules (changes)" + calls: read for `get('charityId', null) == uid` and for approved charity when `status == 0 && open == true`; updates: accept (1→2, `warehouseId` may change to an own existing warehouse), reject (1→0, `open == false`, charity fields removed, `excluded == resource.excluded.concat([uid])`, `lastRejection` with `charityName == resource.charityName`, reason 0–200, `at == request.time`), take open (0 & open → 2, own charity fields, `open == false`), hospital choose again (0 → 1, approved charity, `open == false`, removes `lastRejection`), hospital publish (0 & !open → 0 & open, only `open`, `updatedAt`, `lastRejection` removal). Stock update allows `reserved` (int, 0 ≤ reserved ≤ qty).

- [ ] Failing tests (names): `charity reads a request addressed to it`, `charity cannot read another charity's request`, `charity lists open requests (status 0, open)`, `charity cannot list status 0 without the open filter`, `rejected (not open) request is not readable by other charities`, `addressed charity accepts`, `other charity cannot accept`, `accept may switch to another own warehouse`, `addressed charity rejects with reason; excluded grows`, `reject must clear charity fields and keep open false`, `any approved charity takes an open request`, `charity that rejected can take it once open`, `cannot take a request that is not open`, `hospital chooses another charity after a rejection`, `hospital publishes a rejected request as open`, `charity cannot publish`, `owner raises reserved up to qty, not above`, `accepting charity reads the contact after accepting`.
- [ ] Run `npm run test:rules` FAIL → implement → PASS → commit `feat(rules): charity accept/reject/take, hospital re-choose, reserved stock`.

### Task 3: Domain — reservation plan and best warehouse

**Files:** `src/features/requests/reserve.ts`; test `tests/unit/reserve.test.ts`.

- `planReservation(req: { itemId; qty; accept }, warehouseId, rows: StockRow[]): Record<string, number> | null` — new first then used; null when short.
- `bestWarehouse(req: { itemId; qty; accept; delivery: LatLng }, warehouses: Warehouse[], rows: StockRow[]): { warehouse: Warehouse; available: number; distanceKm: number } | null` — nearest warehouse that alone covers.
- Tests: `new first then used` (30 new + 20 used, 40, any → `{new:30, used:10}` by stock id), `new only when accept new` (→ null), `reserved stock is not available`, `best warehouse is the nearest that covers`.
- [ ] FAIL → implement → PASS → commit `feat(requests): reservation plan and best warehouse`.

### Task 4: Services — charity and hospital transitions

**Files:** `src/services/types.ts`, `fakeServices.ts`, `firebaseServices.ts`; tests `tests/unit/fake-incoming.test.ts`, `tests/integration/incoming.test.ts`.

```ts
requests: {
  watchIncoming(uid, cb: (r: HospitalRequest[]) => void, onError?): Unsubscribe   // charityId == uid, newest first
  watchOpen(cb, onError?): Unsubscribe                                           // status 0 && open
  watchForCharity(id, cb: (r: HospitalRequest | null) => void, onError?): Unsubscribe
  accept(charity: OrgRef, id: string, warehouseId: string): Promise<void>        // sent or open; transaction
  reject(charity: OrgRef, id: string, reason: string): Promise<void>
  chooseAgain(hospital: OrgRef, id: string, choice: CharityChoice): Promise<void>
  publishOpen(hospital: OrgRef, id: string): Promise<void>
}
```
`accept` errors: `ServiceError('invalid-transition', 'short')` → UI «الكمية ما تكفي الحين»; permission-denied / status changed → `ServiceError('invalid-transition', 'taken')` → «أخذته جمعية ثانية».
- [ ] Tests: fake — `addressed charity accepts and stock is reserved`, `accept fails when short`, `reject sends it back to the hospital (not open)`, `hospital publishes, then any charity sees it open and takes it`, `charity that rejected can take it once open`, `hospital chooses again`; integration — `accept reserves stock and reveals the code to the hospital`, `two charities race for an open request: one wins`, `rejected request is not in the open list until published`.
- [ ] FAIL → implement → PASS → commit `feat(services): charity accept/reject/take and hospital re-choose`.

### Task 5: Charity home and incoming list

**Files:** `src/pages/app/Home.tsx` (charity → `Incoming`), `src/pages/app/Incoming.tsx`, `AppShell.tsx` (charity nav «الطلبات الواردة» `/app` end with waiting-count badge, «مخزوني» `/app/stock`), `WarehouseForm`/`MyStock` links already use `/app/stock`. Test `tests/unit/incoming.test.tsx` (update `home.test.tsx`, `my-stock.test.tsx` charity paths).

Tabs لك / مفتوحة / قبلتها (role="tablist"); rows per spike `Inbox.tsx`: hospital, product · qty, priority, «يحتاجه قبل …», distance from my nearest warehouse (or nearest suitable for open), status badge; link `/app/incoming/:id`. Open tab lists only requests the charity can cover from one warehouse (Task 3 `bestWarehouse`). Empty states: «ما فيه طلبات تنتظر ردك», «ما فيه طلبات مفتوحة تقدر تغطيها», «ما قبلت طلبات للحين».
- [ ] Tests: `charity home is الطلبات الواردة with a waiting badge`, `tabs list addressed, open (coverable only) and accepted requests`, `open tab hides requests it can't cover`, `load error shows a message`.
- [ ] FAIL → implement → PASS → commit `feat(incoming): charity home with addressed, open and accepted requests`.

### Task 6: Incoming request page — accept / reject

**Files:** `src/pages/app/IncomingRequest.tsx`; `App.tsx` route `/app/incoming/:id` (charities only; hospitals → `/app`). Test `tests/unit/incoming-request.test.tsx`.

Per spike `Request.tsx`: details, distance, reservation preview («بنحجز N من <warehouse>» + available split), warehouse select when more than one own warehouse covers it (default: the hospital's choice or nearest), [قبول] [رفض] for status 1, [أقبل الطلب] for open; reject dialog with optional reason (≤ 200); after acceptance: «قبلت الطلب، الكمية محجوزة من <warehouse>» + receiver name/phone (watchContact). Errors per Global Constraints. Not readable → «ما لقينا هذا الطلب».
- [ ] Tests: `accepting reserves and shows the receiver`, `short stock shows a message`, `rejecting with a reason returns to the list`, `taking an open request`, `a request for another charity shows not found`, `hospital is sent away`.
- [ ] FAIL → implement → PASS → commit `feat(incoming): accept or reject a request`.

### Task 7: Hospital re-choose + stock reserved display

**Files:** extract the ranking step of `NewRequest.tsx` into `src/features/requests/ChooseCharity.tsx` (props: request summary, `excluded` ids to mark «رفضت الطلب قبل», `onSend(choice)`, `onPublish()`); use it in `NewRequest` and in `RequestDetails` for status 0 && !open (banner «رفضت <name> الطلب» + reason, [اختر جمعية ثانية] [انشره كطلب مفتوح]); status 0 && open shows «طلب مفتوح، أي جمعية عندها الكمية تقدر تقبله». `MyRequests`/status badge: 0 & !open → «بانتظار قرارك». `MyStock`: column «المحجوز» when any row has reserved > 0; delete of a row/warehouse with reserved shows «فيه كمية محجوزة لطلب، ما تقدر تحذفها الحين». Tests: extend `my-requests.test.tsx`, `new-request.test.tsx` (still passes), `my-stock.test.tsx`.
- [ ] Tests: `rejected request shows the banner and lets the hospital choose again`, `charity that rejected is marked in the re-ranking`, `publishing makes it open`, `status badges for waiting-for-decision and open`, `reserved column and blocked delete`.
- [ ] FAIL → implement → PASS → commit `feat(requests): hospital chooses again after a rejection; reserved stock shown`.

### Task 8: Seed, docs, end-to-end, review, deploy

- [ ] Seed: one request from the hospital addressed to جمعية البر (status 1) and one open request.
- [ ] README phase 5 section; all suites + build + lint.
- [ ] Emulator walk-through: charity accepts → hospital sees code; charity rejects → hospital chooses again / publishes → another charity takes it.
- [ ] Final whole-branch review (opus), one fix pass; deploy after the user agrees; push `phase-5`.
