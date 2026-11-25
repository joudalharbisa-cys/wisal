# Phase 6+7 — Preparation, delivery or pickup, arrival, code verification, dated timeline

Status: agreed in conversation 2026-11-26 («تمام نفذه مع المرحلة القادمة»). Tech plan: `../../../../خطة وصال التقنية.md` §6 (statuses, reservation, receipt code) and §7 phases 6 («المتابعة والاجتماع») and 7 («التوصيل والرمز» — "الرحلة كاملة شغالة"). Builds on phase 5 (`2026-11-26-phase5-incoming-design.md`).

## Intent

After a charity accepts, the items still have to reach the hospital. This phase carries a request from acceptance to a verified handover: preparation → delivery (or pickup by the hospital when the charity doesn't deliver) → arrival → the receipt code entered and checked, which closes the request and takes the quantity out of the charity's stock for good. Every step is dated and shown to both sides. After this phase the whole journey works end to end.

## Decisions taken by the user

| Topic | Decision |
|---|---|
| Steps after approval | تجهيز الطلب → توصيل → وصول → تحقق (user's words). |
| Charity that doesn't deliver | **Option أ:** the hospital's courier picks up from the charity's warehouse; the «توصيل» step becomes «جاهز للاستلام». |
| Dates | The approval date and the date/time of **every** step are kept and shown («تاريخ الموافقه مهم و تواريخ جميع المراحل»). |
| My proposals the user approved | Either side may propose an optional meeting (time + an external Meet/Zoom/Teams link); delivery vs pickup follows the charity's «تقدر توصّل»; the charity enters the code the receiver/courier gives; input locks after 5 wrong codes and the hospital is told; full timeline on both request pages; last-step date in the lists. |

## Approaches considered (transport when the charity doesn't deliver)

- أ (chosen) hospital picks up from the warehouse.
- ب charity must always deliver — excludes charities without transport.
- ج decided case by case in the meeting — flexible but adds a negotiation step.

## Statuses (replaces the 6 of the tech plan; now 7)

| # | Label | Moved by | Stored time |
|---|---|---|---|
| 0 | طلب مفتوح / بانتظار قرارك (phase 5) | — | — |
| 1 | بانتظار موافقة الجمعية | hospital (send / choose again) | `sentAt` |
| 2 | تمت الموافقة | charity (accept / take) | `acceptedAt` (exists since phase 5) |
| 3 | تجهيز الطلب | charity «بدأنا التجهيز» | `preparingAt` |
| 4 | قيد التوصيل (delivery) / جاهز للاستلام (pickup) | charity | `outAt` |
| 5 | وصل | charity «وصل» | `arrivedAt` |
| 6 | تم التحقق من الوصول | charity, correct code | `verifiedAt` |

`mode: 'delivery' | 'pickup'` is fixed when moving 2→3 from the charity's `canDeliver`. Steps only move forward one at a time; nobody moves back.

## What each side sees and does

- **Charity request page** (`/app/incoming/:id`), action card by status:
  - 2: [بدأنا التجهيز].
  - 3 delivery: form السائق (name), جوال السائق (05… 10 digits), وقت الوصول المتوقع (date + time) → [طلع للتوصيل]. 3 pickup: [جاهز للاستلام].
  - 4: delivery shows the driver; pickup shows the hospital's courier once entered (or «بانتظار بيانات مندوب المستشفى»). [وصل] (pickup: «وصل مندوب المستشفى»).
  - 5: «اكتب رمز الاستلام» — 4-digit field (Western/Arabic digits) → [تحقق]. Wrong: «الرمز غلط، باقي N محاولات». After 5 wrong: «انقفل إدخال الرمز، تواصل مع المستشفى».
  - 6: «تم التحقق — الطلب مكتمل» and the stock already deducted.
- **Hospital request page** (`/app/requests/:id`): the receipt code (from status 2), the dated timeline, driver details (delivery) or a form for its courier (pickup, status 4: name, phone, expected time), lock notice with [افتح إدخال الرمز] (resets the counter) when locked.
- **Meeting (optional, both sides, statuses 2–5):** «اقترح اجتماع» → date+time and a link (https only) → shown on both pages with who proposed it and [افتح الرابط]; either side may replace or remove it.
- **Timeline (both pages):** each step with its date/time in Arabic (Western digits), the rejection (charity + time) if any, greyed future steps; driver/courier shown on their step.
- **Lists** («طلباتي», «الطلبات الواردة»): status badge + the date of the latest step («تمت الموافقة · 25 نوفمبر»). Progress bars become 7 segments.

## Code verification (rules-enforced, brute-force bounded)

1. The charity writes the attempt: `{ codeAttempt: 'NNNN', codeFails: old + 1, updatedAt }` — allowed only at status 5, by the accepting charity, while `codeFails < 5`.
2. It then writes `{ status: 6, verifiedAt }` plus the stock deduction in one batch — allowed only when the **stored** `codeAttempt == requestSecrets/{id}.code` (rules read the secret; the charity never can).
3. If step 2 is refused, the code was wrong: the UI shows the remaining attempts (5 − codeFails).
4. The hospital may reset `codeFails` to 0 once it reached 5.
Storing the attempt first means every guess is counted, so at most 5 guesses per unlock.

Stock deduction (same batch as status 6): for each `reservation[stockId] = n`: `qty -= n`, `reserved -= n`.

## Data model (requests additions)

```
mode            'delivery' | 'pickup'               set 2→3
sentAt          timestamp                            create (status 1) and choose-again
preparingAt, outAt, arrivedAt, verifiedAt  timestamps
driver          { name 2–60, phone 05XXXXXXXX, eta timestamp }   delivery, set 3→4
pickup          { name 2–60, phone 05XXXXXXXX, eta timestamp }   pickup, hospital, at status 4
meeting         { at timestamp, link https 10–300, byRole 'hospital'|'charity', byName }   optional, statuses 2–5
codeAttempt     '0000'–'9999'                        status 5
codeFails       int 0–5                              status 5
```
Older requests (phase 3/5) without `sentAt`: the UI falls back to `createdAt`.

## Rules (summary)

- Charity forward steps (2→3, 3→4, 4→5): `resource.charityId == uid`, approved charity, exact next status, own time field `== request.time`, `mode` on 2→3 `== (charity.canDeliver ? 'delivery' : 'pickup')`, `driver` required on 3→4 when delivery (forbidden when pickup); changed keys limited per step.
- Code attempt / verify / hospital reset as above. Verify batch also updates the charity's stock rows (`qty` and `reserved` both decrease, stay ≥ 0).
- Stock update rule: `qty` may decrease by the same amount as `reserved` (owner). Already allowed by phase 5's rule (`0 ≤ reserved ≤ qty`).
- Hospital pickup details: owner hospital, status 4, mode pickup; only `pickup`, `updatedAt` change.
- Meeting: hospital owner or accepting charity, status 2–5; only `meeting`, `updatedAt` change; `byRole`/`byName` match the writer.
- `sentAt` added to the create rule (status 1) and choose-again.

## Non-goals

Cancelling, partial delivery, live GPS tracking and the map/route (phase 8), notifications by email/SMS (phase 9), rating.

## Anti-goals

- A charity closing a request without the right code; anyone reading the code except the hospital.
- Unlimited code guessing.
- Steps skipped or reversed; the hospital moving charity steps or vice versa.
- Stock not deducted after verification (or deducted twice).

## Constraints

Spark, client batches/transactions, Western digits (time pickers must show Western digits — reuse the phase 3 calendar plus a simple time select), Arabic copy.

## Calls made after the builder check

- **Rules prove the stock deduction.** The verify rule reads the (at most two) rows named in `reservation` (`…__new`, `…__used`) with `get`/`getAfter` and requires both `qty` and `reserved` to fall by exactly the reserved amount in the same batch. The batch uses `increment(-n)` and also rewrites `warehouseName`/`city` from the current warehouse (so a rename can't make the batch fail).
- **Code counter can't be bypassed:** verify compares the **stored** `resource.data.codeAttempt` with the secret; verify's changed keys are only `status`, `verifiedAt`, `updatedAt`; the attempt write requires `codeFails == get('codeFails', 0) + 1`, `codeFails` before < 5, status unchanged. Verify doesn't require < 5 (a correct 5th try still closes). The UI tells "wrong code" (permission-denied on verify) apart from network errors, which don't say «الرمز غلط».
- **Rejections in the timeline:** `lastRejection` stays on the request only while it waits for the hospital (status 0, not open — readable by the hospital alone, where the banner shows it). On choose-again / publish it moves, in the same batch, to `requestHistory/{id}` (hospital-only; the rules check it's the same value) so other charities never read who rejected or why; the hospital's timeline reads it from there. Only the latest rejection is kept. *(Changed after the final review: keeping it on the request exposed it to other charities.)*
- **Open requests:** new `publishedAt` (create with status 0, and publish) shown as «انتشر كطلب مفتوح».
- **Pickup courier:** the hospital can enter it from status 3 (mode is known); [وصل] doesn't require it.
- `driver.eta`, `pickup.eta`, `meeting.at` are client-chosen times → rules check `is timestamp` only.
- Labels become a function `statusLabel(status, { open, mode })`; a new `status-6` colour token; all progress bars 7 segments. No stored request is above status 2, so renumbering needs no migration; `mode` appears on 2→3 from the charity's current «تقدر توصّل».

## Left to the builder

Component structure; time-input control; exact copy of empty/disabled states; how the timeline is laid out on mobile.
