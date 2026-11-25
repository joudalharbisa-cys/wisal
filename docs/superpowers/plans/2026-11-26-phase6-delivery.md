# Phase 6+7 — Delivery, Pickup, Code and Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Carry an accepted request through preparation → delivery or pickup → arrival → verified receipt code (stock deducted), with a dated timeline on both sides and an optional meeting link.

**Architecture:** 7 statuses (0–6) with a label function; new request fields (mode, step times, driver, pickup, meeting, codeAttempt/codeFails); rules for each forward step, the counted code check and the rules-proven stock deduction; service methods (fake + Firebase); a shared Timeline; action cards on the charity page and tracking on the hospital page. Screens follow branch `phase6-screens` (`src/preview/delivery/*`).

**Spec:** `docs/superpowers/specs/2026-11-26-phase6-delivery-design.md` (incl. "Calls made after the builder check").

## Global Constraints

- Statuses: 0 open/waiting, 1 sent, 2 accepted, 3 preparing, 4 out for delivery / ready for pickup, 5 arrived, 6 verified. Forward one step at a time only.
- `mode` fixed on 2→3 from the charity's `canDeliver`. Delivery needs `driver {name, phone 05XXXXXXXX, eta}` on 3→4; pickup forbids it.
- Code: attempt write (counted, `codeFails` +1, only while < 5) then verify (stored attempt == secret) with stock `qty`/`reserved` both `increment(-n)` for each reservation row, in one batch. 5 counted attempts → locked until the hospital resets.
- Times: `sentAt`, `publishedAt`, `acceptedAt`, `preparingAt`, `outAt`, `arrivedAt`, `verifiedAt` (server time); `driver.eta`, `pickup.eta`, `meeting.at` are user-chosen.
- `lastRejection` is kept (no longer deleted). Western digits; Arabic copy; commits end with the Co-Authored-By line.

## Review Focus

1. A charity guessing codes without counting (verify write carrying its own `codeAttempt`) → denied. (Task 3 rules test.)
2. Verify that skips or halves the stock deduction → denied; correct one → qty and reserved both fall by the reservation. (Task 3 + 4 tests.)
3. 5th attempt correct → closes; 5 wrong → locked, hospital unlocks → can try again. (Task 4 tests.)
4. Network failure during verify is not shown as «الرمز غلط». (Task 6 test.)
5. A hospital-side page for a delivery request never shows a pickup form and vice versa. (Tasks 6–7 tests.)

---

### Task 1: Status model (labels, colours, progress)
Files: `src/lib/labels.ts` (`RequestStatus = 0..6`, `statusLabel(status, { open?, mode? }): string`, `STATUS_SHORT` 7 entries), `src/styles/theme.css` (`--color-status-6`), `src/components/ui/Badge.tsx` (STATUS_CLASS 0–6; `StatusBadge({ status, open?, mode? })` uses `statusLabel`), `src/features/requests/RequestStatus.tsx` (badge delegates; progress 7 segments), `src/pages/Identity.tsx` (7 statuses). Labels: 0 «طلب مفتوح» / «بانتظار قرارك» (open false); 1 «بانتظار موافقة الجمعية»; 2 «تمت الموافقة»; 3 «تجهيز الطلب»; 4 «قيد التوصيل» / «جاهز للاستلام» (pickup); 5 «وصل، بانتظار الرمز»; 6 «تم التحقق من الوصول». Tests: `tests/unit/labels.test.ts` (update) + ui badge test.

### Task 2: Types, mapping, send/choose/publish times
Files: `src/features/requests/types.ts` (new fields), `firebaseServices.ts` (`toRequest` maps all times incl. nested `driver.eta`, `pickup.eta`, `meeting.at`; `send` writes `sentAt` (status 1) or `publishedAt` (status 0); `chooseAgain` writes `sentAt`; `publishOpen` writes `publishedAt`; none delete `lastRejection`), fake mirrors, rules create/chooseAgain/publish accept the new time fields and no longer require removing `lastRejection`. Tests: update phase 5 rules/fake tests that assumed deletion; new `send records sentAt / publishedAt`.

### Task 3: Rules — forward steps, pickup, meeting, code, deduction
File `firestore.rules`; tests `tests/rules/delivery.rules.test.ts`: `charity starts preparing with the right mode`, `mode must match canDeliver`, `delivery dispatch needs a valid driver`, `pickup ready forbids a driver`, `steps cannot be skipped or reversed`, `hospital cannot move charity steps`, `hospital sets its pickup courier from status 3 (pickup only)`, `meeting can be set by either side in statuses 2–5 with an https link`, `attempt counts (codeFails +1, <5)`, `verify with the stored correct code and full deduction succeeds`, `verify carrying its own guess is denied`, `verify with a wrong stored code is denied`, `verify without the stock deduction is denied`, `hospital unlocks after 5`, `charity cannot unlock`.

### Task 4: Services
`requests`: `startPreparing(charity, id)`, `dispatch(charity, id, driver | null)`, `markArrived(charity, id)`, `submitCode(charity, id, code): Promise<'ok' | 'wrong' | 'locked'>` (throws ServiceError('network') on non-permission errors), `setPickup(hospital, id, pickup)`, `unlockCode(hospital, id)`, `setMeeting(by: OrgRef, id, meeting | null)`. Fake mirrors rules (secret compare, deduction). Tests: `tests/unit/fake-delivery.test.ts`, `tests/integration/delivery.test.ts` (full journey delivery + pickup, wrong code count, lock/unlock, deduction).

### Task 5: Timeline
`src/features/requests/Timeline.tsx` + `buildTimeline(r, viewer: 'hospital' | 'charity'): Step[]` (sent/published, last rejection, accepted, preparing, out/ready (+driver or courier note), arrived, verified; future steps without time). `formatDateTime(d)` («الأربعاء 26 نوفمبر · 1:40 م», Western digits). Lists show `latestStepDate`. Tests `tests/unit/timeline.test.ts(x)`.

### Task 6: Charity request page actions
`IncomingRequest.tsx`: per status per spec — [بدأنا التجهيز]; delivery form (name, phone digits-only 05×10, eta = calendar day + time select) / [جاهز للاستلام]; [وصل]; code entry (4 digits, Arabic digits accepted) with «الرمز غلط، باقي N محاولات», «انقفل إدخال الرمز، تواصل مع المستشفى», network message «تعذّر الاتصال، حاول مرة ثانية»; done card. Timeline card. Meeting card. Tests `tests/unit/incoming-delivery.test.tsx`.

### Task 7: Hospital request page tracking
`RequestDetails.tsx`: timeline; driver shown; pickup courier form (status 3–4, pickup); lock notice + [افتح إدخال الرمز]; meeting card + «اقترح اجتماع» dialog (both pages share `MeetingCard`). Lists show last-step date. Tests `tests/unit/hospital-tracking.test.tsx`.

### Task 8: Seed, README, e2e, review, deploy
Seed one accepted request ready to walk; README phase 6+7; all suites; emulator walk-through (prepare → dispatch → arrive → wrong code → right code → stock deducted); opus review + fix pass; deploy after the user agrees; push `phase-6`.
