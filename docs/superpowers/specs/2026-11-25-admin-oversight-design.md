# Admin oversight (لوحة الإشراف) — design

Date: 2026-11-25 · Status: draft for approval · Builds on phases 0–7 (branch `phase-6`).

## Intent

The Wesal admin should «يكون عنده دراية عن كل شي»: every hospital and charity, every warehouse and its stock, every request and where it is in its journey with the date of each step. For now the admin **watches only, as a supervisor** (user's words: «حاليا ممكن بس يشوف ك مشرف»). Today the admin has a single page, «طلبات التسجيل», for approving or rejecting new organisations.

Success: an admin opens Wesal and, without asking anyone, can answer «وين وصل طلب مستشفى الملك فهد؟», «كم سرير عند جمعية البر وكم منها محجوز؟», «مين رفض هذا الطلب وليش؟», «فيه طلبات متأخرة او رمز مقفول؟».

## Decisions taken by the user

- Approach **A — a standalone supervision area** inside the admin section (chosen over «view as an organisation» and over downloadable reports).
- ~~View only.~~ **Changed 2026-11-27:** the admin also gets a few actions that help organisations while they use Wesal (user: «خلي عنده صلاحيات مثلا الرمز يعيد تعين المحاولات و اشياء مثل ثانيه تساعد بتحسين تجربه العملاء»). See *Admin actions*. No more screen approval rounds: build directly (user: «لا ترويني صور تصميم ابدا تنفيذ على طول»); the throwaway screens on `admin-screens` are the reference.
- **A full step log** («سجل كامل»), chosen over keeping only the latest rejection: from now on every step of every request is appended to a log that is never overwritten, so the admin can answer «مين رفض وليش» even after several rejections.

## Approaches considered

- **A. Standalone supervision area (chosen).** New admin pages: overview, organisations (with each one's warehouses, stock and requests), requests (filterable, each with its full dated timeline). Reuses the request timeline, badges and cards; rules only gain read access. One place to see everything at once.
- **B. «Enter as» an organisation.** The admin opens a hospital's or charity's own pages read-only. Fewer new screens, but no all-requests view, and every button on every page would need disabling — easy to miss one, and that would make the admin able to act.
- **C. Downloadable reports (Excel/PDF).** A snapshot, not live awareness of stages; could be added on top of A later.

## Goals

1. **نظرة عامة** (`/admin`): live numbers and attention points.
   - Organisations: approved hospitals, approved charities, applications waiting (links to «طلبات التسجيل»).
   - Requests by stage: طلب مفتوح, بانتظار قرار المستشفى (rejected, waiting), بانتظار موافقة الجمعية, تمت الموافقة, تجهيز الطلب, قيد التوصيل / جاهز للاستلام, وصل، بانتظار الرمز, تم التحقق. Each number links to the requests list pre-filtered.
   - Needs attention: requests past their «آخر موعد» and not yet arrived; requests with the code entry locked (5 wrong codes); open requests no charity can cover yet (no single charity warehouse holds the quantity).
   - Latest activity: the ten most recent dated steps across all requests (step label · request · organisation · date and time).
2. **الجهات** (`/admin/orgs`): every organisation — name, role, city, status (approved / pending / rejected), and for approved ones a short count (warehouses; requests sent or handled). Filter by role and status, search by name.
3. **صفحة الجهة** (`/admin/orgs/:id`): its profile (all application fields, contact email, contract version / signer / date, review date and reviewer), its warehouses each with its stock rows (product, condition, quantity, reserved, available), and its requests (a hospital's own requests; for a charity the requests sent to it or taken by it, and the ones it rejected) with stage and latest step date.
4. **الطلبات** (`/admin/requests`): every request, newest activity first, with filters by stage, priority, hospital, charity, and a search by product. Each row: product · quantity, priority, hospital → charity (or «مفتوح»), stage badge, latest step and its date and time, overdue / locked markers.
5. **صفحة الطلب** (`/admin/requests/:id`): everything about it — the full dated timeline from the step log (every send, every rejection with charity, reason and time, re-sends, publication, taking, each later step, each wrong-code attempt as «محاولة رمز غلط» without its digits, unlock, meeting changes, courier changes), and the code-check step; driver or hospital courier with phone and expected time; meeting (time, link, who proposed it); receiver name and phone; delivery place; the reserving warehouse and reserved quantities; wrong-code attempts count and whether entry is locked.
6. Navigation for the admin: نظرة عامة · الجهات · الطلبات · طلبات التسجيل (the existing review page moves to `/admin/applications`; its behaviour is unchanged).

## Admin actions (builder's selection, each logged as «إدارة وصال»)

1. **Reset code attempts** («صفّر محاولات الرمز»): status 5 with at least one counted attempt → `codeFails` 0 (whether or not entry is locked).
2. **Return to the hospital** («أرجع الطلب للمستشفى»): a request waiting for a charity's answer (status 1) goes back to the hospital (status 0, not open) with a reason, so it can choose another charity or publish it. The charity is **not** marked as having rejected it. The hospital sees «أرجعت إدارة وصال الطلب من {الجمعية}» with the reason until it moves on.
3. **Note from the admin** («ملاحظة من إدارة وصال»): a short text (2–300 characters) on any request, shown on both the hospital's and the charity's request page with its date; the admin can replace or remove it.

Each action is allowed by the rules for admins only, changes only its own fields, and writes its log entry in the same transaction.

## Non-goals

- Other admin actions (cancel a request, edit stock or requests, suspend an organisation).
- Showing receipt codes. They stay readable by the hospital alone (from dispatch on).
- Exports (Excel/PDF), maps (phase 8), notifications.

## Anti-goals (a failure even if it works)

- An admin able to write anything beyond the three actions above (and the existing application review).
- The admin seeing a receipt code in the app — including the last typed attempt (`codeAttempt`), which after verification equals the code: stripped in the admin data mapping and never shown.
- Hospitals or charities gaining any read access through this work.
- Pages that feel slow or show stale data without saying so.

## Data and rules (read-only additions)

- Already readable by the admin: all `orgs` (get/list), all `requests`, each org's `warehouses` and `stock` (and stock via the collection group).
- Add **admin read** to `requestContacts` (receiver) and `requestHistory` (past rejection). `requestSecrets` stays unreadable.
- All warehouses at once: add a collection-group read rule for `warehouses` for the admin; a warehouse's owner is its parent path (warehouse docs carry no `orgId`).
- Live listeners (onSnapshot) on all orgs, all requests and all stock rows; per-request reads for contact and history when a request page is open. At hackathon scale this stays far inside the Spark plan's free reads; the overview counts are computed on the client.
- Rules tests prove: admin reads contacts and history; admin cannot read secrets; admin cannot write requests/stock/warehouses/contacts/history; non-admins gain nothing.

### The step log (new)

- `requests/{id}/events/{n}`: one document per step — `type` (sent, published, rejected, resent, taken, accepted, preparing, dispatched, ready, arrived, codeAttempt, verified, unlocked, meetingSet, meetingRemoved, pickupSet), `at` (server time), `byRole`, `byName`, and the step's details (charity name for sent/resent/taken, reason for rejected, driver/courier for dispatched/pickupSet, meeting time and link). Never the code or a typed attempt.
- Append-only: created in the same batch/transaction as the step it records; never updated or deleted.
- A counter `eventCount` on the request; the rules accept an event only as the next number, written in the same transaction, by the org (or admin) that makes the step, with its own name and role. *Builder's call:* the rules don't refuse a step that comes without an event (requiring it would rewrite every existing rules test); the app always logs, so only a hand-made client could leave a gap — and the request's own step dates still show what happened.
- Readers: the admin (all events, including a collection-group listener for the overview's «آخر النشاط»), and the owning hospital (its own request's events). Charities don't read the log — other charities' rejections stay private.
- Requests created before this change have no log: their timeline falls back to the step dates on the request plus `lastRejection` / `requestHistory`, and the page says the history before this date is partial.
- This changes the existing write paths (send, reject, choose-again, publish, take, accept, every phase-6 step) in rules, the Firebase services and the fake services; it must keep every existing rules/unit/integration test green.

## Constraints

Spark plan (no Cloud Functions), client-side Firebase, Arabic RTL with Western digits, the existing visual identity and components, dates and times formatted like the rest of the app («الأربعاء 26 نوفمبر · 1:40 م»).

## How it is shown

- The admin timeline is the request timeline with a third viewer, `admin`: it shows what the hospital sees **plus** the code-check step and the rejection history, in neutral wording (e.g. «أُرسل لجمعية البر», «وافقت جمعية البر», «رفضت جمعية الشمال الطلب»).
- Stage badges for the admin use the full 7-step labels (the hospital-only «وصل» shortening doesn't apply).
- Screens follow the project process: throwaway spike on a `admin-screens` branch, screenshots to «D:\ملفاتي\وصال\تصاميم لوحة الإشراف» for approval before the plan.

## Calls made after the builder check

- `codeAttempt` is stripped in the app (not moved out of the request): Firestore can't hide one field from a reader, so it still reaches the admin's browser and is visible in developer tools, but it only matches the code once the request is finished. Moving it would rewrite the phase-7 code check.
- Order of work: approve this doc → throwaway screen spike → user approves screenshots → plan → build. The data, rules and log can't start before the plan either.
- «راجعها»: shows «أنت» when `reviewedBy` is the signed-in admin, otherwise «أدمن ثاني», with the review date — no new rule to read other admins' names.

## Left to the builder

Component structure, how filters are held (URL query vs state), exact empty/loading copy, table vs card rows on mobile, how the overview numbers are laid out.
