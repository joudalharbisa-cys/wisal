# Admin oversight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Wesal admin sees every organisation, warehouse, stock row and request (with a full step log), and can reset code attempts, return an unanswered request to the hospital, and leave a note on a request.

**Architecture:** Every request step appends `requests/{id}/events/{n}` in the same Firestore transaction, with a counter `eventCount` on the request. Admin pages read all orgs/requests/stock live, events per request and via a collection-group query for the activity feed. Three admin actions are new rule branches limited to their own fields.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Firebase 12 (Firestore rules + emulator tests), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-admin-oversight-design.md` (reference screens: branch `admin-screens`, `src/preview/admin/Screens.tsx`).

## Global Constraints

- Spark plan, client-side Firebase only; Arabic RTL copy, Western digits, dates via `formatDateTime` («الأربعاء 26 نوفمبر · 1:40 م»).
- The receipt code (`requestSecrets`) is never readable by the admin; `codeAttempt` is stripped in `toRequest` and never rendered.
- The admin writes only: application review (existing), `codeFails` reset, return-to-hospital, `adminNote`.
- Hospitals/charities gain no new read access except the hospital reading its own request's events.
- Every existing unit / rules / integration test stays green.

## Review Focus

1. A request created before the log (no `eventCount`) — admin page still shows a timeline (fallback to step dates) and says the log is partial.
2. Two writers on the same request at once (e.g. meeting + dispatch) — the transaction retries; neither step is lost and the counter stays in sequence.
3. Admin returns a request at the moment the charity accepts it — exactly one wins; stock reservation stays consistent.
4. Admin note longer than 300 characters or only spaces — refused in UI and rules.
5. Admin opens a request whose hospital/contact docs are missing (legacy) — page renders with «—».

---

### Task 1: Step log on every request step

**Files:** Create `src/features/requests/events.ts`; modify `firestore.rules`, `src/services/types.ts`, `src/services/firebaseServices.ts`, `src/services/fakeServices.ts`, `src/features/requests/types.ts`, `firestore.indexes.json`. Tests: `tests/rules/events.rules.test.ts`, `tests/unit/fake-events.test.ts`, `tests/integration/events.test.ts`.

**Interfaces — produces:**
- `type EventType = 'sent' | 'published' | 'resent' | 'rejected' | 'returned' | 'taken' | 'accepted' | 'preparing' | 'dispatched' | 'ready' | 'arrived' | 'pickupSet' | 'meetingSet' | 'meetingRemoved' | 'codeAttempt' | 'verified' | 'unlocked' | 'note'`
- `type RequestEvent = { n: number; requestId: string; type: EventType; at: Date; byRole: 'hospital' | 'charity' | 'admin'; byName: string; charityName?: string; detail?: string; count?: number }`
- `HospitalRequest.eventCount?: number`
- `requests.watchEvents(id, cb: (e: RequestEvent[]) => void): Unsubscribe` (oldest first; null-safe: denied → `[]`)
- Firebase helper `step(id, actor, build)` running a transaction: read request, `n = (eventCount ?? 0) + 1`, update request with `eventCount: n`, set `events/{n}` with `at: serverTimestamp()`.

**Rules:** event doc `requests/{rid}/events/{eid}` — create if `getAfter(request).eventCount == int(eid)`, `at == request.time`, keys ⊆ {type, at, byRole, byName, charityName, detail, count}, `type` in the list, writer = (admin ∧ byRole 'admin' ∧ byName 'إدارة وصال') or (org role/name match); no update/delete; read by admin or the request's hospital. Request update: global `counterOk` — if `eventCount` changes it is old+1 and the event exists after; every `changed().hasOnly([...])` list gains `'eventCount'`. Create: optional `eventCount == 1` with event 1 existing after. Collection-group `{path=**}/events/{eid}` read for admin; index override `events.at` DESC collection group.
**Ruling (ledger):** steps aren't refused without an event (keeps the 146 rules tests unchanged); the app always logs.

- [ ] Step 1: `tests/rules/events.rules.test.ts` — (a) hospital creates request + event 1 `sent` in one batch: succeeds; event with n≠eventCount fails; (b) charity accept with eventCount 2 + event `accepted` byRole charity byName own: succeeds; byName of another org fails; (c) skipping a number (eventCount 3 from 1) fails; (d) event update/delete fail; (e) hospital reads its events, other charity/hospital can't, admin can; (f) admin can't read `requestSecrets`.
- [ ] Step 2: run → fails. `npx vitest run tests/rules/events.rules.test.ts --environment node` (emulators running).
- [ ] Step 3: rules as above.
- [ ] Step 4: `tests/unit/fake-events.test.ts` — full journey (send → reject with reason → chooseAgain → accept → prepare → dispatch → arrived → wrong code → right code) yields events types in order `sent, rejected, resent, accepted, preparing, dispatched, arrived, codeAttempt, codeAttempt, verified` with `byName`s and the reject `detail` = reason; `eventCount` = 10. Run → fails.
- [ ] Step 5: fake: `state.events: Map<string, RequestEvent[]>`, `log(id, actor, type, extra)` called from every transition; `watchEvents`.
- [ ] Step 6: Firebase: `step()` helper; rewrite send (batch with event 1), accept/take, reject, chooseAgain/publish (moveOn inside a transaction), startPreparing, dispatch (`dispatched`/`ready`), markArrived, setPickup, setMeeting (`meetingSet`/`meetingRemoved`), unlockCode, submitCode (attempt = transaction with `codeAttempt` + count; verify = transaction re-reading the request, stock increments, `verified`). `toRequest` drops `codeAttempt`.
- [ ] Step 7: `tests/integration/events.test.ts` — the same journey on the emulator, hospital `watchEvents` sees all 10 in order. Run all three suites; commit `feat(requests): append-only step log on every request step`.

### Task 2: Admin read access and admin data services

**Files:** modify `firestore.rules`, `src/services/types.ts`, `firebaseServices.ts`, `fakeServices.ts`, `src/session/resolveRoute.ts`. Tests: `tests/rules/admin.rules.test.ts`, `tests/unit/fake-admin.test.ts`, resolveRoute test.

**Produces (`admin.*`):** `watchAllOrgs(cb: (o: OrgWithId[]) => void)`, `watchAllRequests(cb: (r: HospitalRequest[]) => void)`, `watchAllStock(cb: (rows: StockRow[]) => void)`, `watchRecentEvents(max: number, cb: (e: RequestEvent[]) => void)` (newest first). Admin reads `requestContacts` and `requestHistory`; `resolveRoute` lets the admin onto any `/admin/*` path.

- [ ] Rules tests: admin reads contacts/history/events and lists all requests/orgs/stock; admin still can't read secrets; admin can't write warehouses/stock/contacts/history; a charity can't read events or history. RED → rules → GREEN.
- [ ] Fake tests for the four watchers (only when signed in as admin; others get `[]`). RED → implement → GREEN. Commit.

### Task 3: Admin actions

**Files:** `firestore.rules`, services, `src/features/requests/types.ts`, `src/pages/app/RequestDetails.tsx`, `src/pages/app/IncomingRequest.tsx`, new `src/features/requests/AdminNoteCard.tsx`. Tests: `tests/rules/admin-actions.rules.test.ts`, `tests/unit/fake-admin-actions.test.ts`, `tests/unit/admin-note.test.tsx`.

**Produces:** `HospitalRequest.adminNote?: { text: string; at: Date }`, `HospitalRequest.adminReturn?: { charityName: string; reason: string; at: Date }`; `admin.resetCode(id)`, `admin.returnToHospital(id, reason)`, `admin.setNote(id, text | null)` — each logs `unlocked` / `returned` (detail = reason, charityName) / `note` (detail = text) as «إدارة وصال».

Rules: `adminResetOk` status 5 ∧ codeFails ≥ 1 → 0; `adminReturnOk` status 1 → 0, open false, charity fields removed, `adminReturn` {charityName == old, reason 3–200, at == time}, `excluded` unchanged; `adminNoteOk` only `adminNote` (text 2–300 trimmed, at == time) or its removal; chooseAgainOk/publishOk may remove `adminReturn` (must, if present).

- [ ] Rules tests for each (allowed for admin; denied for hospital/charity; wrong status denied; note 1 char / 301 chars denied; return keeps `excluded`; hospital can choose again after return and `adminReturn` is gone).
- [ ] Fake tests mirroring them + events written.
- [ ] UI: hospital waiting banner shows «أرجعت إدارة وصال الطلب من {الجمعية}» + «السبب: …» with the same two buttons; both request pages show `AdminNoteCard` («ملاحظة من إدارة وصال», text, date). Tests in `admin-note.test.tsx`. Commit.

### Task 4: Admin pages

**Files:** create `src/pages/admin/{AdminOverview,AdminOrgs,AdminOrg,AdminRequests,AdminRequest}.tsx`, `src/features/admin/{stages.ts,adminTimeline.ts,AdminStatus.tsx}`; move `AdminReview` to `/admin/applications`; modify `App.tsx`, `AppShell.tsx` (admin nav: نظرة عامة · الجهات · الطلبات · طلبات التسجيل with pending badge). Tests: `tests/unit/admin-stages.test.ts`, `tests/unit/admin-timeline.test.ts`, `tests/unit/admin-pages.test.tsx`.

**Produces:**
- `stageOf(r: HospitalRequest): Stage` with `Stage = 'open' | 'waitingHospital' | 'waitingCharity' | 'approved' | 'preparing' | 'out' | 'arrived' | 'verified'`; `isLate(r, now)` (neededBy < start of today ∧ status < 5); `isLocked(r)` (status 5 ∧ codeFails ≥ 5); `uncovered(r, rows)` (status 0 ∧ open ∧ no charity warehouse with `availableIn ≥ qty`).
- `eventSteps(events: RequestEvent[]): Step[]` — labels: sent «أُرسل ل{charityName}», published «انتشر كطلب مفتوح», resent «أُرسل ل{charityName}», rejected «رفضت {byName} الطلب» (note «السبب: …»), returned «أرجعت إدارة وصال الطلب من {charityName}», taken «أخذته {byName}», accepted «وافقت {byName}», preparing «بدأ التجهيز», dispatched «طلع للتوصيل» (note detail), ready «جاهز للاستلام», arrived «وصل», pickupSet «{byName} حدد المندوب», meetingSet «اقترح {byName} اجتماع», meetingRemoved «انحذف الاجتماع», codeAttempt «محاولة رمز غلط ({count} من 5)» unless the next event is `verified` → «كتبت الجمعية الرمز الصحيح», verified «تم التحقق», unlocked «انفتح إدخال الرمز» (by …), note «ملاحظة من إدارة وصال» (note text). Requests without events → `buildTimeline(r, 'admin')` (new viewer = hospital steps + «تم التحقق»).
- Pages per the spike: overview (stats, stage tiles linking `/admin/requests?stage=…`, attention list, recent activity from `watchRecentEvents(10)`), orgs (role/status chips, search), org (profile with «أنت» / «أدمن ثاني» reviewer, warehouses + stock table, its requests, and for charities the ones it rejected), requests (stage chips + hospital/charity/priority selects + product search; URL `?stage=`), request (status bar of 7, full log, facts, actions: «صفّر محاولات الرمز» (status 5 ∧ codeFails ≥ 1), «أرجع الطلب للمستشفى» (status 1, reason dialog), note add/edit/remove).
- [ ] Unit tests for stages/attention/timeline, then pages (render with fake admin session: overview counts, filter by stage, org page stock and «أنت», request page shows log and runs the three actions). Commit.

### Task 5: Seed, README, suites, walk-through, review

- [ ] Seed: one request with a rejection then resend, one returned by admin, one note (via the services or seed writes with events).
- [ ] README «لوحة الإشراف» section; spec status line.
- [ ] Unit, rules, integration suites green; emulator walk-through as admin (overview → request → reset code / return / note) and as hospital/charity seeing the note and the return.
- [ ] Opus final review, one fix pass; deploy only when the user says «انشر».
