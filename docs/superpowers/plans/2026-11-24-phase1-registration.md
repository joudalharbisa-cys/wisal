# Wesal Phase 1 — Registration, Sign-in & Admin Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hospital or charity can register (org data + contract acceptance), wait for Wesal admin approval, and on approval sign in to its own (empty) home; a Wesal admin can approve or reject applications with a reason.

**Architecture:** Firebase Auth (email/password) + Firestore `orgs/{uid}` and `admins/{uid}`, guarded by Security Rules proven on the emulator. All Firebase access goes through one `Services` interface supplied by React context, so screens are tested with an in-memory fake and the real implementation is tested against emulators. A pure `resolveRoute(session, path)` decides where each user may be. UI uses the approved identity (style B: green brand band, white cards floating over it).

**Tech Stack:** existing phase-0 stack (React 19, Vite 8, TS, Tailwind v4, Firebase 12, Vitest, Testing Library, rules-unit-testing) + `lucide-react` icons.

**Spec:** `D:\ملفاتي\وصال\خطة وصال التقنية.md` — sections ٤ (roles), ٥ (data shape), ٧ (phase ١: «مستشفى وجمعية يسجلون ويوقّعون العقد، والإدارة تقبل وترفض، والمقبول يدخل»). UX reference: `وصال - تجربة المستخدم (نسخة نهائية ٢).pdf` pages 4 (registration). Visual reference: branch `identity-preview`, folder `src/preview/` and screenshots in `D:\ملفاتي\وصال\شاشات تجريبية\الاتجاه ب - كل الشاشات\`.

## Global Constraints

- Branch `phase-1` from `main`; nothing from `src/preview/` is copied — only the approved identity primitives are re-implemented with tests (Task 1).
- Everything on drive D: (npm cache `.npmrc`, emulator jars `.firebase-emulators/`).
- Arabic RTL UI; Western digits everywhere (identity decision); LTR for emails, phone numbers, license numbers via `LtrText` or `dir="ltr"` inputs.
- Firebase Spark only: Auth + Firestore + Hosting. **No license file upload in this phase** (Storage needs Blaze → phase 9); license **number** only.
- Map location is phase 8; registration collects `city` (fixed list) + `district` (text).
- Roles exactly: `'hospital' | 'charity'`; statuses exactly: `'pending' | 'approved' | 'rejected'`.
- Contract: version `'1.0-draft'`, clauses from spec (مشاركة معلومات المخزون، سرية المعلومات). The text is a placeholder until the team sends the real contract; only `contract.ts` changes when it arrives.
- Admins are added by hand: create the user in Firebase Console → Authentication, then a Firestore doc `admins/{uid}` with `{ name }`. No client can write `admins`.
- Every Firestore path not opened in Task 3 stays denied.
- Arabic copy for auth errors: wrong credentials «البريد أو كلمة المرور غير صحيحة», email in use «هذا البريد مسجّل من قبل», weak password «كلمة المرور لازم تكون 8 أحرف على الأقل», network «تعذّر الاتصال، حاول مرة ثانية», fallback «صار خطأ غير متوقع، حاول مرة ثانية».

## Review Focus

1. Registration half-completes (Auth account created, Firestore write fails) → on next sign-in the user lands back on `/register` to finish, not on a blank page. (Task 5 route test + Task 8 test.)
2. A signed-in applicant tries to set their own `status` to `'approved'` or edit `rejectReason` → denied by rules. (Task 3.)
3. A rejected applicant fixes data and resubmits → status returns to `pending`, previous `rejectReason` kept for the admin. (Tasks 3, 9.)
4. Admin rejects without a reason (or 1–2 chars) → blocked in UI and by rules. (Tasks 3, 10.)
5. Double-click on submit/approve → one write, button disabled while pending. (Tasks 8, 10.)

---

## File Structure

```
src/
  styles/theme.css                         radius-card 16px, radius-control 8px
  components/ui/                           Button, Card, Badge, Table (style B versions), Field.tsx, Input.tsx, Spinner.tsx
  components/brand/LogoMark.tsx            approved mark
  components/brand/BrandBand.tsx           green gradient band + dots (used by AppShell and auth pages)
  features/orgs/types.ts                   Org, OrgApplication, OrgRole, OrgStatus
  features/orgs/validate.ts                validateApplication()
  features/orgs/cities.ts                  CITIES
  features/orgs/contract.ts                CONTRACT
  features/auth/errors.ts                  authErrorMessage()
  services/types.ts                        Services interface
  services/firebaseServices.ts             real implementation
  services/fakeServices.ts                 in-memory implementation (tests + local demo)
  services/ServicesContext.tsx             ServicesProvider, useServices()
  session/useSession.ts                    Session from services
  session/resolveRoute.ts                  pure routing decision
  session/Guard.tsx                        redirects per resolveRoute
  layout/AppShell.tsx                      style-B shell for signed-in users
  pages/auth/Login.tsx  Register.tsx  Pending.tsx
  pages/app/HospitalHome.tsx  CharityHome.tsx   (empty states for now)
  pages/admin/AdminReview.tsx
firestore.rules
tests/unit/...      tests/rules/orgs.rules.test.ts      tests/integration/firebaseServices.test.ts
```

---

### Task 1: Promote the approved identity into main

**Files:**
- Modify: `src/styles/theme.css`, `src/components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Table.tsx`, `vite.config.ts`, `src/pages/Identity.tsx`
- Create: `src/components/brand/LogoMark.tsx`, `src/components/brand/BrandBand.tsx`, `src/components/ui/Field.tsx`, `src/components/ui/Input.tsx`, `src/components/ui/Spinner.tsx`
- Test: `tests/unit/ui.test.tsx` (extend), `tests/unit/brand.test.tsx`

**Interfaces:**
- Produces:
  - `Button` variants unchanged in name; `danger` = white bg + red ring (style B); prop `loading?: boolean` → disabled + `Spinner` + `aria-busy="true"`.
  - `Card({ title?, action?, flush?, children })`.
  - `PriorityBadge`/`StatusBadge`: tinted pill + dot (`bg-{c}/10 text-{c} ring-{c}/20`).
  - `Field({ label, error?, hint?, children })`: renders `<label>`; `error` text has `role="alert"` and the child input gets `aria-invalid` via `Input`.
  - `Input(props: InputHTMLAttributes & { invalid?: boolean })` (h-10, focus ring primary-light).
  - `Spinner({ className? })` with `role="status"` and label «جاري التحميل».
  - `LogoMark({ className? })`, `BrandBand({ tall?: boolean })` (absolute gradient band behind page top, `aria-hidden`).
- Copy-from-reference: visual classes may follow `identity-preview:src/components/ui/*` and `src/preview/Logo.tsx`, but each change starts with a failing test below.

- [ ] **Step 1: Write failing tests** (append to `ui.test.tsx`, new `brand.test.tsx`):

```tsx
it('PriorityBadge is a soft tinted pill', () => {
  render(<PriorityBadge priority="urgent" />)
  expect(screen.getByText('عاجلة').className).toContain('bg-urgent/10')
})
it('Button loading disables and announces busy', () => {
  render(<Button loading>إرسال</Button>)
  const b = screen.getByRole('button', { name: /إرسال/ })
  expect(b).toBeDisabled(); expect(b).toHaveAttribute('aria-busy', 'true')
})
it('Field shows error as alert and marks input invalid', () => {
  render(<Field label="الاسم" error="الاسم مطلوب"><Input invalid /></Field>)
  expect(screen.getByRole('alert')).toHaveTextContent('الاسم مطلوب')
  expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
})
it('Card renders action next to title', () => {
  render(<Card title="الطلبات" action={<span>عرض الكل</span>}>x</Card>)
  expect(screen.getByText('عرض الكل')).toBeInTheDocument()
})
// brand.test.tsx
it('LogoMark is decorative', () => { const { container } = render(<LogoMark />); expect(container.querySelector('svg')).toHaveAttribute('aria-hidden') })
```

Plus in `theme.test.ts`: `expect(css).toContain('--radius-card: 16px')`.
- [ ] **Step 2: Run** `npm test` → FAIL on the new tests.
- [ ] **Step 3: Implement** the files above; add `optimizeDeps: { entries: ['index.html'] }` to `vite.config.ts`; `npm i lucide-react`. Update `Identity.tsx` to show `Field`/`Input` and `Button loading`.
- [ ] **Step 4: Run** `npm test` → PASS (existing contrast test must still pass); `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat: promote approved identity (style B) primitives`.

---

### Task 2: Org domain types, validation, cities, contract

**Files:** Create `src/features/orgs/types.ts`, `validate.ts`, `cities.ts`, `contract.ts`; Test `tests/unit/orgs.test.ts`

**Interfaces:**
- Produces:

```ts
export type OrgRole = 'hospital' | 'charity'
export type OrgStatus = 'pending' | 'approved' | 'rejected'
export type OrgApplication = {
  role: OrgRole; name: string; city: string; district: string; licenseNo: string
  hospitalType?: 'gov' | 'private'          // hospital only, required for hospital
  workingHours?: string; canDeliver?: boolean // charity only, both required for charity
}
export type Org = OrgApplication & {
  status: OrgStatus; rejectReason?: string; contactEmail: string
  contract: { version: string; acceptedAt: Date; acceptedByName: string }
  createdAt: Date; updatedAt: Date; reviewedBy?: string; reviewedAt?: Date
}
export type OrgWithId = Org & { id: string }
export function validateApplication(a: Partial<OrgApplication>): Partial<Record<keyof OrgApplication, string>>
export const CITIES: readonly string[]   // ['الرياض','جدة','مكة المكرمة','المدينة المنورة','الدمام','الطائف','أبها','تبوك']
export const CONTRACT: { version: '1.0-draft'; title: string; clauses: string[] }
```

- Validation messages (exact): name <2 chars → «اكتب اسم الجهة»; city not in CITIES → «اختر المدينة»; district empty → «اكتب الحي»; licenseNo not `/^[0-9A-Za-z-]{3,30}$/` → «رقم الترخيص غير صحيح»; hospital without hospitalType → «اختر نوع المستشفى»; charity without workingHours → «اكتب أوقات العمل»; charity with `canDeliver` undefined → «حدد إذا عندكم توصيل». Values are trimmed before checks.

- [ ] **Step 1: Failing tests** in `orgs.test.ts`:

```ts
const hospital = { role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov' } as const
expect(validateApplication(hospital)).toEqual({})
expect(validateApplication({ ...hospital, hospitalType: undefined })).toEqual({ hospitalType: 'اختر نوع المستشفى' })
expect(validateApplication({ ...hospital, name: '  ' }).name).toBe('اكتب اسم الجهة')
expect(validateApplication({ ...hospital, licenseNo: '12' }).licenseNo).toBe('رقم الترخيص غير صحيح')
expect(validateApplication({ ...hospital, city: 'لندن' }).city).toBe('اختر المدينة')
const charity = { role: 'charity', name: 'جمعية الشمال', city: 'جدة', district: 'النعيم', licenseNo: '4521', workingHours: 'الأحد-الخميس 8ص-4م', canDeliver: false } as const
expect(validateApplication(charity)).toEqual({})
expect(validateApplication({ ...charity, canDeliver: undefined }).canDeliver).toBe('حدد إذا عندكم توصيل')
expect(CONTRACT.version).toBe('1.0-draft')
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS. **Step 5: Commit** `feat: org application types, validation, cities, draft contract`.

---

### Task 3: Firestore rules for orgs and admins

**Files:** Modify `firestore.rules`; Create `tests/rules/orgs.rules.test.ts`; delete nothing in `tests/rules/firestore.rules.test.ts` (keep deny tests for other paths, e.g. `requests`).

**Interfaces:**
- Produces rules: helper `isAdmin()` = `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`.
  - `orgs/{uid}` **create**: `request.auth.uid == uid`, `status == 'pending'`, `role in ['hospital','charity']`, keys `hasOnly([role,name,city,district,licenseNo,hospitalType,workingHours,canDeliver,status,contactEmail,contract,createdAt,updatedAt])`, `name` string 2–100, `licenseNo` string 3–30, `contactEmail == request.auth.token.email`, `contract.version is string`, `contract.acceptedAt == request.time`, `createdAt == request.time`, `updatedAt == request.time`.
  - **get**: owner or admin. **list**: admin only.
  - **update by owner**: only when `resource.data.status == 'rejected'` and new `status == 'pending'`; `diff().affectedKeys().hasOnly([name,city,district,licenseNo,hospitalType,workingHours,canDeliver,status,updatedAt])`; `updatedAt == request.time`.
  - **update by admin**: affectedKeys `hasOnly([status,rejectReason,reviewedBy,reviewedAt,updatedAt])`; new status in `['approved','rejected']`; if `'rejected'` then `rejectReason` string size ≥ 3; `reviewedBy == request.auth.uid`; `reviewedAt == request.time`.
  - **delete**: never.
  - `admins/{uid}` **get**: `request.auth.uid == uid`; no writes; no list.

- [ ] **Step 1: Failing tests** (`orgs.rules.test.ts`; timestamps via `firebase.firestore.FieldValue.serverTimestamp()` from `firebase/compat/app` because test contexts are compat Firestore; seed admins/orgs via `env.withSecurityRulesDisabled`; contexts built with `authenticatedContext(uid, { email })` so `request.auth.token.email` is set):
  - `applicant can create own pending org` → assertSucceeds.
  - `applicant cannot create org for another uid` → assertFails.
  - `applicant cannot create with status approved` → assertFails.
  - `applicant cannot create with extra field isVerified` → assertFails.
  - `owner can read own org; other user cannot` → succeed / fail.
  - `applicant cannot approve self (pending→approved)` → assertFails.
  - `rejected owner can resubmit (rejected→pending) without touching rejectReason` → assertSucceeds; same update that also changes `rejectReason` → assertFails.
  - `admin can list orgs; non-admin list fails`.
  - `admin can approve`; `admin reject without reason fails`; `admin reject with reason 'الترخيص منتهي' succeeds`.
  - `nobody can write admins/{uid}`; `user can read own admins doc only`.
  - `nobody can delete orgs`.
- [ ] **Step 2:** `npm run test:rules` → FAIL (deny-all). **Step 3:** write rules. **Step 4:** `npm run test:rules` → all PASS (including the existing deny tests for `requests`). **Step 5: Commit** `feat: security rules for org applications and admin review`.

---

### Task 4: Services layer (interface, Firebase impl, fake)

**Files:** Create `src/services/types.ts`, `firebaseServices.ts`, `fakeServices.ts`, `ServicesContext.tsx`, `src/features/auth/errors.ts`; Test `tests/unit/auth-errors.test.ts`, `tests/unit/fake-services.test.ts`, `tests/integration/firebaseServices.test.ts`; Modify `package.json` (script `test:integration`).

**Interfaces:**
- Consumes: Task 2 types/validation.
- Produces:

```ts
export type AuthUser = { uid: string; email: string }
export interface Services {
  auth: {
    onUserChanged(cb: (u: AuthUser | null) => void): () => void
    signIn(email: string, password: string): Promise<void>
    signUp(email: string, password: string): Promise<AuthUser>
    signOut(): Promise<void>
  }
  orgs: {
    watchOrg(uid: string, cb: (org: Org | null) => void): () => void
    submitApplication(user: AuthUser, app: OrgApplication, acceptedByName: string): Promise<void>
    resubmit(uid: string, app: OrgApplication): Promise<void>
  }
  admin: {
    isAdmin(uid: string): Promise<boolean>
    watchPending(cb: (orgs: OrgWithId[]) => void): () => void
    approve(orgId: string, adminUid: string): Promise<void>
    reject(orgId: string, adminUid: string, reason: string): Promise<void>
  }
}
export class ServiceError extends Error { code: string }       // wraps Firebase codes
export function authErrorMessage(code: string): string        // Arabic copy from Global Constraints
export function createFirebaseServices(): Services            // uses getAuthClient()/getDb() from lib/firebase.ts; timestamps via serverTimestamp()
export function createFakeServices(seed?: { users?: {email:string;password:string;uid:string}[]; orgs?: Record<string, Org>; admins?: string[] }): Services & { _state: unknown }
export function ServicesProvider(props: { services: Services; children: ReactNode }): JSX.Element
export function useServices(): Services
```

- `watchPending` orders by `createdAt` ascending, filter `status == 'pending'`.
- Firebase→code mapping: `auth/invalid-credential|wrong-password|user-not-found` → `'wrong-credentials'`; `auth/email-already-in-use` → `'email-in-use'`; `auth/weak-password` → `'weak-password'`; `auth/network-request-failed` → `'network'`; else `'unknown'`.
- The fake enforces the same transitions as the rules (only pending creation, only rejected→pending resubmit, reject needs reason ≥3) so UI tests exercise real constraints.

- [ ] **Step 1: Failing tests:**
  - `auth-errors.test.ts`: each code → exact Arabic string from Global Constraints.
  - `fake-services.test.ts`: signUp then submitApplication → `watchOrg` emits org with `status 'pending'`; signIn wrong password rejects with `ServiceError` code `'wrong-credentials'`; `reject` with reason `'لا'` rejects; approve → watchOrg emits `'approved'`; resubmit only allowed from `'rejected'`.
  - `firebaseServices.test.ts` (emulators auth+firestore, project `demo-wesal`; admin seeded with rules-unit-testing `withSecurityRulesDisabled`): full flow signUp → submitApplication → admin approve → applicant `watchOrg` sees `'approved'`.
- [ ] **Step 2:** `npm test` and `npm run test:integration` → FAIL. Script: `"test:integration": "cross-env FIREBASE_EMULATORS_PATH=.firebase-emulators firebase emulators:exec --only auth,firestore --project demo-wesal \"vitest run --dir tests/integration --environment node\""`; integration test sets `VITE_USE_EMULATORS`-equivalent by calling `connectAuthEmulator`/`connectFirestoreEmulator` through an exported `createFirebaseServices({ emulators: true })` option.
- [ ] **Step 3:** implement. **Step 4:** both suites PASS. **Step 5: Commit** `feat: services layer with Firebase and in-memory implementations`.

---

### Task 5: Session and route resolution

**Files:** Create `src/session/useSession.ts`, `resolveRoute.ts`, `Guard.tsx`; Test `tests/unit/resolve-route.test.ts`, `tests/unit/guard.test.tsx`

**Interfaces:**
- Consumes: `Services` (Task 4).
- Produces:

```ts
export type Session =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'admin'; user: AuthUser }
  | { kind: 'member'; user: AuthUser; org: Org | null }
export function useSession(): Session
export function resolveRoute(s: Session, path: string): { redirect: string } | { allow: true } | { wait: true }
export function Guard(props: { children: ReactNode }): JSX.Element  // Spinner on wait, <Navigate replace> on redirect
```

- Rules: loading → wait. anonymous → allow `/login`, `/register`; else redirect `/login`. admin → allow `/admin*`; else `/admin`. member with org null → allow `/register`; else `/register`. member pending|rejected → allow `/pending` only (a rejected org edits its data on `/pending`, never on `/register`); else `/pending`. member approved → allow `/app*`; else `/app`. Paths `/identity` always allowed.

- [ ] **Step 1: Failing tests** — table-driven in `resolve-route.test.ts` covering every row above, including `member, org null, path '/app' → {redirect:'/register'}` (Review Focus 1) and `approved, '/login' → {redirect:'/app'}`. `guard.test.tsx`: with fake services and an approved member, rendering at `/login` ends on the app home heading.
- [ ] **Step 2:** FAIL. **Step 3:** implement (`useSession` subscribes to `onUserChanged`, then `isAdmin`, then `watchOrg`). **Step 4:** PASS. **Step 5: Commit** `feat: session state and route guard`.

---

### Task 6: App shell and approved-member homes

**Files:** Create `src/layout/AppShell.tsx`, `src/pages/app/HospitalHome.tsx`, `CharityHome.tsx`; Modify `src/App.tsx` (routes under `<Guard>`), `src/main.tsx` (`ServicesProvider` with `createFirebaseServices()`); Test `tests/unit/app-shell.test.tsx`

**Interfaces:**
- Consumes: `BrandBand`, `LogoMark`, `useServices`, `useSession`.
- Produces: `AppShell({ title, sub?, action?, tall?, children })` — band + top nav (role-based links: hospital «الرئيسية»; charity «الرئيسية»; more links arrive in later phases), org name chip, sign-out button «تسجيل الخروج». Homes: welcome heading «أهلًا، {org.name}» and an empty-state card: hospital «ما عندك طلبات للحين. الطلبات تبدأ في المرحلة الجاية.»; charity «ما فيه طلبات واردة للحين.».

- [ ] **Step 1: Failing test:** approved hospital member at `/app` shows `أهلًا، مستشفى الملك فهد` and a button `تسجيل الخروج`; clicking it calls `auth.signOut` and lands on `/login`.
- [ ] **Step 2:** FAIL. **Step 3:** implement; `App.tsx` routes: `/login`, `/register`, `/pending`, `/app`, `/admin`, `/identity`, and `/` → `<Guard>` redirect. **Step 4:** PASS; `npm run build` OK. **Step 5: Commit** `feat: app shell and member home placeholders`.

---

### Task 7: Login screen

**Files:** Create `src/pages/auth/Login.tsx`, `src/layout/AuthLayout.tsx` (split layout: form + brand panel); Test `tests/unit/login.test.tsx`

**Interfaces:** Consumes `useServices().auth`, `authErrorMessage`. Produces route `/login` with heading «تسجيل الدخول», fields «البريد الإلكتروني» (`type=email`, `dir=ltr`, required) and «كلمة المرور» (`type=password`), button «دخول» (loading while submitting), link «سجّل مستشفى أو جمعية» → `/register`.

- [ ] **Step 1: Failing tests:** wrong password → alert «البريد أو كلمة المرور غير صحيحة»; empty email → field error «اكتب البريد الإلكتروني» and `signIn` not called; success → Guard routes approved member to `/app`.
- [ ] **Steps 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: login screen`.

---

### Task 8: Registration flow

**Files:** Create `src/pages/auth/Register.tsx` (+ step components in same folder: `RoleStep.tsx`, `DetailsStep.tsx`, `ContractStep.tsx`); Test `tests/unit/register.test.tsx`

**Interfaces:** Consumes `validateApplication`, `CITIES`, `CONTRACT`, `services.auth.signUp`, `services.orgs.submitApplication`. Produces `/register`, three steps with a 3-dot stepper: (1) «نوع الجهة» cards مستشفى / جمعية; (2) «بيانات الجهة»: shared fields + role fields (hospital: نوع المستشفى حكومي/خاص; charity: أوقات العمل, «عندكم توصيل؟» نعم/لا) + account fields (email, password, confirm) — account fields hidden when already signed in with no org (Review Focus 1); (3) «عقد التعاون»: scrollable clauses, name of signer, checkbox «قرأت العقد وأوافق عليه», button «وقّع وأرسل الطلب».

- [ ] **Step 1: Failing tests:**
  - step 2 «التالي» with empty name shows «اكتب اسم الجهة» and stays on step 2;
  - charity shows «أوقات العمل» and not «نوع المستشفى»;
  - password ≠ confirm → «كلمتا المرور غير متطابقتين»; password < 8 → «كلمة المرور لازم تكون 8 أحرف على الأقل»;
  - step 3 submit disabled until checkbox checked and signer name ≥ 3 chars;
  - submit calls `signUp` once then `submitApplication` with the exact `OrgApplication` and signer name, then routes to `/pending`;
  - double click on submit → `submitApplication` called once (Review Focus 5);
  - signed-in member with `org: null` opening `/register` sees no email/password fields and submitting calls only `submitApplication`;
  - `email-in-use` error → alert «هذا البريد مسجّل من قبل» on step 2.
- [ ] **Steps 2–4:** FAIL → implement (style B: band with title «تسجيل جهة جديدة», white card) → PASS. **Step 5: Commit** `feat: three-step registration with contract acceptance`.

---

### Task 9: Pending / rejected screen

**Files:** Create `src/pages/auth/Pending.tsx`; Test `tests/unit/pending.test.tsx`

**Interfaces:** Consumes `useSession` (member org), `services.orgs.resubmit`, `DetailsStep` (reuse in edit mode). Produces `/pending`: pending → «طلبك قيد المراجعة» with submitted summary and created date; rejected → `Alert tone="danger"` «تم رفض الطلب» + `rejectReason`, button «تعديل وإعادة الإرسال» opening the details form prefilled; save → `resubmit` → shows pending state. Sign-out button available.

- [ ] **Step 1: Failing tests:** pending org shows «طلبك قيد المراجعة» and the org name; rejected org shows reason «الترخيص منتهي»; edit name + save calls `resubmit(uid, {...})` with the new name and the screen switches to the pending message (Review Focus 3); when the fake flips the org to approved, the app routes to `/app`.
- [ ] **Steps 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: application status screen with resubmit`.

---

### Task 10: Admin review screen

**Files:** Create `src/pages/admin/AdminReview.tsx`; Test `tests/unit/admin.test.tsx`

**Interfaces:** Consumes `services.admin.*`, `useSession` (admin). Produces `/admin` in `AppShell` with title «طلبات التسجيل»: list of pending orgs (name, role badge مستشفى/جمعية, city, license number in LTR, submitted date); selecting one shows details incl. contract version/signer/date; actions «قبول» and «رفض». Reject opens a reason textarea (required ≥ 3 chars, error «اكتب سبب الرفض»). Empty state «ما فيه طلبات جديدة». Buttons use `loading` during writes.

- [ ] **Step 1: Failing tests:** two pending orgs listed; approve calls `approve(orgId, adminUid)` once and the item disappears; reject with empty reason shows «اكتب سبب الرفض» and does not call `reject`; reject with «الترخيص منتهي» calls `reject(id, adminUid, 'الترخيص منتهي')`; double click approve → one call; empty list shows «ما فيه طلبات جديدة».
- [ ] **Steps 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat: admin review of org applications`.

---

### Task 11: Deploy and end-to-end check

**Files:** Modify `README.md` (admin bootstrap steps, phase-1 flow, `test:integration`).

- [ ] **Step 1: Run** `npm test`, `npm run test:rules`, `npm run test:integration`, `npx tsc -b`, `npm run build` → all green.
- [ ] **Step 2: Human step.** The user creates the admin: Firebase Console → Authentication → Add user (their email); copy UID; Firestore → collection `admins` → document id = UID, field `name` (string).
- [ ] **Step 3: Run** `npm run deploy` (predeploy guard runs).
- [ ] **Step 4: Live check** on `https://wisal-90bcd.web.app`: register a test hospital (`test-hospital@…` test account recorded in README test section, not real data) → lands on «طلبك قيد المراجعة»; admin signs in → sees it in «طلبات التسجيل» → approves; hospital refreshes → lands on «أهلًا، …». Repeat reject → reason shown → resubmit → pending.
- [ ] **Step 5: Commit** `docs: phase 1 README`, push branch, open PR to `main` (user approves merge).

---

## Done when (phase ١ per spec)

Hospital and charity register and sign the contract; Wesal admin approves or rejects with a reason; the approved org signs in to its home; rules proven by emulator tests; deployed and checked live.
