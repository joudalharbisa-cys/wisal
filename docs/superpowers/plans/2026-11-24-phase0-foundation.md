# Wesal Phase 0 — Visual Identity & Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fresh Arabic RTL React site, styled from a reviewable identity (tokens + base components + identity page), connected to Firebase with deny-all rules, deployed to Firebase Hosting, in its own Git repo.

**Architecture:** Vite + React + TypeScript single-page app. All visual decisions live in one token file (`src/styles/theme.css`, Tailwind v4 `@theme`) so a designer can replace values without touching components. Firebase is initialised once in `src/lib/firebase.ts` from env vars; Firestore rules deny everything until later phases open specific paths, proven by emulator tests.

**Tech Stack:** Node 20+, Vite, React 18, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), react-router-dom, `@fontsource/ibm-plex-sans-arabic`, Firebase JS SDK (Auth + Firestore), Vitest + @testing-library/react + jsdom, `@firebase/rules-unit-testing`, firebase-tools (emulators + hosting).

**Spec:** `D:\ملفاتي\وصال\خطة وصال التقنية.md` (sections ٢, ٦, ٧ — phase ٠). UX reference: `D:\ملفاتي\وصال\وصال - تجربة المستخدم (نسخة نهائية ٢).pdf`.

## Global Constraints

- Repo root: `D:\ملفاتي\وصال\wesal-app`. Everything (Node, Java, npm cache, emulators) installed on drive D:, never C:.
- `<html lang="ar" dir="rtl">`; all UI copy in Arabic.
- Nothing copied from the prototype (`wisal.html`): no code, colors, or layout. Only the spec's rules/labels.
- Firebase Spark (free) plan only in this phase: Auth, Firestore, Hosting. No Storage, no Functions.
- No secrets committed: `.env.local` is git-ignored; `.env.example` lists keys with empty values.
- Labels copied verbatim from the spec:
  - Priority: `urgent`=«عاجلة», `medium`=«متوسطة», `normal`=«عادية».
  - Status 0–5: «بانتظار جهة مناسبة», «بانتظار موافقة الجمعية», «تمت الموافقة», «قيد التسليم», «تم التسليم، بانتظار التحقق», «تم التحقق من الوصول».
- Identity values in Task 2 are a **proposal** pending team approval at the end of Task 4; if a designer supplies values, only `theme.css` changes.

## Review Focus

1. Missing/partial `.env.local` → the page shows a clear Arabic message naming the missing keys, not a white screen. (Test in Task 5.)
2. Latin/number content inside RTL (emails, phone numbers, the 4-digit code) renders in the correct order. (Test in Task 3: `LtrText` keeps `dir="ltr"`.)
3. Arabic font fails to load → readable fallback (`"IBM Plex Sans Arabic", Tahoma, sans-serif`). (Asserted in Task 2 test on the token file.)
4. A signed-in user tries to read/write any Firestore document → denied. (Rules test in Task 5.)
5. Phone width 360px → identity page has no horizontal scroll. (Manual check step in Task 4.)

---

## File Structure

```
wesal-app/
  index.html                     lang/dir, title «وصال»
  vite.config.ts                 react + tailwind plugins, vitest config
  .env.example                   VITE_FIREBASE_* keys (empty)
  firebase.json  .firebaserc     hosting (dist, SPA rewrite), firestore rules, emulators
  firestore.rules                deny-all
  src/
    main.tsx                     router + font import
    App.tsx                      routes, config-error guard
    styles/theme.css             ALL identity tokens (@theme)
    lib/labels.ts                Priority/RequestStatus types + Arabic labels
    lib/firebase.ts              getFirebaseConfig(), app/auth/db
    components/ui/Button.tsx  Card.tsx  Badge.tsx  Alert.tsx  LtrText.tsx  Table.tsx
    pages/Home.tsx               placeholder landing
    pages/Identity.tsx           identity showcase for review (/identity)
    components/ConfigError.tsx
  tests/
    unit/*.test.ts(x)            vitest (jsdom)
    rules/firestore.rules.test.ts  emulator-only
```

---

### Task 1: Project scaffold with RTL and test runner

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/pages/Home.tsx`, `tests/unit/setup.ts`
- Test: `tests/unit/app.test.tsx`

**Interfaces:**
- Produces: `App` (default export of `src/App.tsx`) rendering routes `/` → `Home`, `/identity` → `Identity` (added in Task 4). `Home` renders `<h1>وصال</h1>`.

- [ ] **Step 1: Prerequisites.** `node -v` ≥ 20 (install to `D:\tools\node` if missing). Run `npm config set cache D:\npm-cache`. Run `git init` in `D:\ملفاتي\وصال\wesal-app`.
- [ ] **Step 2: Scaffold** with `npm create vite@latest . -- --template react-ts`, then `npm i react-router-dom` and `npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom`. Add script `"test": "vitest run --dir tests/unit"`. Configure vitest in `vite.config.ts`: `environment: 'jsdom'`, `setupFiles: ['tests/unit/setup.ts']` (imports `@testing-library/jest-dom/vitest`). Delete Vite demo assets.
- [ ] **Step 3: Write the failing test** `tests/unit/app.test.tsx`:

```tsx
it('renders the Wesal home inside RTL document', () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('وصال')
})
it('index.html declares Arabic RTL', () => {
  const html = readFileSync('index.html', 'utf8')
  expect(html).toMatch(/<html[^>]*lang="ar"[^>]*dir="rtl"/)
  expect(html).toContain('<title>وصال</title>')
})
```

(`App` contains `<Routes>`; `main.tsx` wraps it in `BrowserRouter`.)
- [ ] **Step 4: Run** `npm test` → FAIL (no heading / wrong html attrs).
- [ ] **Step 5: Implement** `index.html` (`<html lang="ar" dir="rtl">`, title «وصال»), `App.tsx` routes, `Home.tsx` with `<h1>وصال</h1>` and one line «منصة تربط احتياج المستشفيات بالجمعيات».
- [ ] **Step 6: Run** `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 7: Commit** `git add -A; git commit -m "chore: scaffold Vite React TS app with RTL and vitest"` (this commit also adds this plan file).

---

### Task 2: Identity tokens and domain labels

**Files:**
- Create: `src/styles/theme.css`, `src/lib/labels.ts`
- Modify: `src/main.tsx` (import `@fontsource/ibm-plex-sans-arabic/400.css`, `500.css`, `700.css` and `./styles/theme.css`), `vite.config.ts` (add `@tailwindcss/vite`)
- Test: `tests/unit/labels.test.ts`, `tests/unit/theme.test.ts`

**Interfaces:**
- Produces (`src/lib/labels.ts`):
  - `type Priority = 'urgent' | 'medium' | 'normal'`
  - `type RequestStatus = 0 | 1 | 2 | 3 | 4 | 5`
  - `PRIORITY_LABEL: Record<Priority, string>`
  - `STATUS_LABEL: Record<RequestStatus, string>`
  - `STATUS_SHORT: Record<RequestStatus, string>` = بانتظار، مطابقة، موافقة، تسليم، وصول، تحقق
- Produces (Tailwind color names usable as `bg-*`/`text-*`/`border-*`): `primary`, `primary-dark`, `primary-light`, `accent`, `accent-light`, `ink`, `muted`, `line`, `surface`, `hospital`, `charity`, `urgent`, `medium`, `normal`, `status-0` … `status-5`.

- [ ] **Step 1: Install** `npm i -D tailwindcss @tailwindcss/vite` and `npm i @fontsource/ibm-plex-sans-arabic`.
- [ ] **Step 2: Write the failing tests.**

```ts
// labels.test.ts
expect(PRIORITY_LABEL).toEqual({ urgent: 'عاجلة', medium: 'متوسطة', normal: 'عادية' })
expect(STATUS_LABEL[0]).toBe('بانتظار جهة مناسبة')
expect(STATUS_LABEL[4]).toBe('تم التسليم، بانتظار التحقق')
expect(STATUS_LABEL[5]).toBe('تم التحقق من الوصول')
expect(Object.values(STATUS_SHORT)).toEqual(['بانتظار','مطابقة','موافقة','تسليم','وصول','تحقق'])
// theme.test.ts — reads src/styles/theme.css as text
for (const name of ['primary','accent','ink','hospital','charity','urgent','medium','normal','status-0','status-5'])
  expect(css).toContain(`--color-${name}:`)
expect(css).toMatch(/--font-sans:\s*"IBM Plex Sans Arabic",\s*Tahoma,\s*sans-serif/)
```

- [ ] **Step 3: Run** `npm test` → FAIL.
- [ ] **Step 4: Implement** `labels.ts` with the spec labels, and `theme.css` = `@import "tailwindcss";` + `@theme { … }` with these proposed values:

| token | value | token | value |
|---|---|---|---|
| primary | `#0F6B5C` | hospital | `#0E7490` |
| primary-dark | `#0A4D42` | charity | `#4338CA` |
| primary-light | `#E3F2EF` | urgent | `#DC2626` |
| accent | `#C08A2B` | medium | `#D97706` |
| accent-light | `#FBF3E2` | normal | `#16A34A` |
| ink | `#13201D` | status-0 | `#64748B` |
| muted | `#5B6B67` | status-1 | `#B45309` |
| line | `#E3E8E6` | status-2 | `#1D4ED8` |
| surface | `#F6F8F7` | status-3 | `#4338CA` |
| | | status-4 | `#7C3AED` |
| | | status-5 | `#15803D` |

Also `--font-sans: "IBM Plex Sans Arabic", Tahoma, sans-serif;` and `--radius-card: 16px; --radius-control: 10px;`. Body: `bg-surface text-ink font-sans`.
- [ ] **Step 5: Run** `npm test` → PASS; `npm run dev` and confirm the home heading uses the Arabic font.
- [ ] **Step 6: Commit** `git commit -am "feat: identity tokens (proposal) and Arabic domain labels"` (add new files first).

---

### Task 3: Base UI components

**Files:**
- Create: `src/components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Alert.tsx`, `LtrText.tsx`, `Table.tsx`
- Test: `tests/unit/ui.test.tsx`

**Interfaces:**
- Consumes: `Priority`, `RequestStatus`, `PRIORITY_LABEL`, `STATUS_LABEL` (Task 2); token color names.
- Produces:
  - `Button(props: { variant?: 'primary' | 'secondary' | 'danger' | 'outline' } & ButtonHTMLAttributes<HTMLButtonElement>)` (default `primary`, default `type="button"`)
  - `Card(props: { title?: string; children: ReactNode })`: title renders as `<h2>`
  - `PriorityBadge(props: { priority: Priority })`, `StatusBadge(props: { status: RequestStatus })`: text is the Arabic label; color from `urgent|medium|normal` / `status-N`; `StatusBadge` root has `data-testid="status-badge"`
  - `Table(props: { columns: string[]; rows: ReactNode[][] })`: semantic `<table>` with `<th scope="col">`, zebra rows, horizontal scroll inside its own wrapper on narrow screens
  - `Alert(props: { tone: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode })` with `role="alert"` for `danger`/`warning`, `role="status"` otherwise
  - `LtrText(props: { children: ReactNode })` = `<bdi dir="ltr">`

- [ ] **Step 1: Write the failing tests.**

```tsx
it('Button defaults to type=button and primary', () => {
  render(<Button>قبول</Button>)
  const b = screen.getByRole('button', { name: 'قبول' })
  expect(b).toHaveAttribute('type', 'button'); expect(b.className).toContain('bg-primary')
})
it('PriorityBadge shows Arabic label', () => {
  render(<PriorityBadge priority="urgent" />); expect(screen.getByText('عاجلة')).toBeInTheDocument()
})
it('StatusBadge renders all six statuses', () => {
  ;([0,1,2,3,4,5] as const).forEach(s => render(<StatusBadge status={s} />))
  expect(screen.getByText('تم التحقق من الوصول')).toBeInTheDocument()
})
it('Alert danger is announced', () => {
  render(<Alert tone="danger">خطأ</Alert>); expect(screen.getByRole('alert')).toHaveTextContent('خطأ')
})
it('LtrText keeps numbers left-to-right', () => {
  render(<LtrText>4821</LtrText>); expect(screen.getByText('4821')).toHaveAttribute('dir', 'ltr')
})
it('Card title is a heading', () => {
  render(<Card title="المخزون">x</Card>); expect(screen.getByRole('heading', { name: 'المخزون' })).toBeInTheDocument()
})
it('Table renders column headers and cells', () => {
  render(<Table columns={['الصنف','الكمية']} rows={[['كراسي متحركة', 40]]} />)
  expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['الصنف','الكمية'])
  expect(screen.getByRole('cell', { name: '40' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run** `npm test` → FAIL (modules missing).
- [ ] **Step 3: Implement** the five components with Tailwind token classes only (no hex values in components). Use logical spacing (`ps-*`/`pe-*`, `ms-*`/`me-*`) so RTL works without overrides.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: base UI components on identity tokens"`.

---

### Task 4: Identity page for team review

**Files:**
- Create: `src/pages/Identity.tsx`
- Modify: `src/App.tsx` (route `/identity`)
- Test: `tests/unit/identity.test.tsx`

**Interfaces:**
- Consumes: all Task 3 components, Task 2 labels.
- Produces: route `/identity` showing: color swatches with token name + hex, type scale (h1/h2/body/small), all `Button` variants, the three `PriorityBadge`s, the six `StatusBadge`s, four `Alert` tones, one `Card`, one `Table` (columns «الصنف», «الكمية», «الحالة»), and an `LtrText` example (`example@wesal.sa`, `4821`).

- [ ] **Step 1: Write the failing test.**

```tsx
it('identity page shows every token and badge', () => {
  render(<MemoryRouter initialEntries={['/identity']}><App /></MemoryRouter>)
  for (const t of ['primary','accent','hospital','charity','urgent','status-5']) expect(screen.getByText(t)).toBeInTheDocument()
  for (const l of ['عاجلة','متوسطة','عادية']) expect(screen.getByText(l)).toBeInTheDocument()
  expect(screen.getAllByTestId('status-badge')).toHaveLength(6)
  expect(screen.getAllByRole('button')).toHaveLength(4)
  expect(screen.getByRole('table')).toBeInTheDocument()
})
```
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `Identity.tsx`; responsive grid that collapses to one column under 640px.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Manual check:** `npm run dev`, open `/identity` at 360px width (browser devtools): no horizontal scroll; Arabic text right-aligned; `4821` and the email read left-to-right.
- [ ] **Step 6: Commit** `git commit -m "feat: identity review page"`.
- [ ] **Step 7: Review gate (human):** share a screenshot of `/identity` with the team. Approved, or changed values go into `theme.css` only. Do not start phase 1 screens before approval.

---

### Task 5: Firebase connection and deny-all rules

**Files:**
- Create: `src/lib/firebase.ts`, `src/components/ConfigError.tsx`, `.env.example`, `firebase.json`, `.firebaserc`, `firestore.rules`
- Modify: `src/App.tsx` (render `ConfigError` when config invalid), `package.json` scripts
- Test: `tests/unit/firebase-config.test.ts`, `tests/unit/config-error.test.tsx`, `tests/rules/firestore.rules.test.ts`

**Interfaces:**
- Produces:
  - `REQUIRED_ENV = ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'] as const`
  - `getFirebaseConfig(env: Record<string, string | undefined>): FirebaseOptions`: throws `MissingConfigError` whose `.missing: string[]` lists absent/empty keys
  - `class MissingConfigError extends Error { missing: string[] }`
  - lazy getters `getDb(): Firestore`, `getAuthClient(): Auth`. When `import.meta.env.VITE_USE_EMULATORS === 'true'`, connect to Firestore emulator `127.0.0.1:8080` and Auth emulator `http://127.0.0.1:9099`
  - `ConfigError(props: { missing: string[] })`: `Alert tone="danger"` with «إعدادات Firebase ناقصة:» followed by each key inside `LtrText`

- [ ] **Step 1: Prerequisites.** Java 11+ for emulators (install to `D:\tools\java` if missing). Run `npm i firebase` and `npm i -D firebase-tools @firebase/rules-unit-testing`.
- [ ] **Step 2: Human step.** Create Firebase project «wesal» on the **Spark** plan (no card). Enable Authentication (Email/Password) and Firestore. Register a web app, then paste its config into `.env.local`. Run `npx firebase login` (interactive, done by the user).
- [ ] **Step 3: Write the failing tests.**

```ts
// firebase-config.test.ts
const full = { VITE_FIREBASE_API_KEY:'k', VITE_FIREBASE_AUTH_DOMAIN:'d', VITE_FIREBASE_PROJECT_ID:'p', VITE_FIREBASE_APP_ID:'a' }
expect(getFirebaseConfig(full)).toEqual({ apiKey:'k', authDomain:'d', projectId:'p', appId:'a' })
try { getFirebaseConfig({ ...full, VITE_FIREBASE_PROJECT_ID: '' }); throw 0 }
catch (e) { expect(e).toBeInstanceOf(MissingConfigError); expect((e as MissingConfigError).missing).toEqual(['VITE_FIREBASE_PROJECT_ID']) }
// config-error.test.tsx
render(<ConfigError missing={['VITE_FIREBASE_API_KEY']} />)
expect(screen.getByRole('alert')).toHaveTextContent('إعدادات Firebase ناقصة')
expect(screen.getByText('VITE_FIREBASE_API_KEY')).toHaveAttribute('dir','ltr')
// tests/rules/firestore.rules.test.ts (initializeTestEnvironment with firestore.rules)
await assertFails(unauthed.firestore().doc('orgs/x').get())
await assertFails(authed('u1').firestore().doc('orgs/u1').set({ name: 'a' }))
await assertFails(authed('u1').firestore().collection('requests').get())
```

- [ ] **Step 4: Run** `npm test` → FAIL; `npm run test:rules` → FAIL (no rules file).
- [ ] **Step 5: Implement** `firebase.ts`, `ConfigError.tsx`, the App guard (catch `MissingConfigError` once at startup), `.env.example` (four keys, empty values, plus `VITE_USE_EMULATORS=`), and `firestore.rules`:

```
rules_version = '2';
service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if false; } } }
```

`firebase.json`: hosting `public: "dist"`, rewrite `** → /index.html`; firestore rules path; emulators auth 9099, firestore 8080, ui enabled. Script `"test:rules": "firebase emulators:exec --only firestore \"vitest run --dir tests/rules --environment node\""`.
- [ ] **Step 6: Run** `npm test` → PASS; `npm run test:rules` → PASS (3 denials).
- [ ] **Step 7: Commit** `git commit -m "feat: Firebase config, config-error screen, deny-all Firestore rules"` (verify `.env.local` is not staged).

---

### Task 6: Deploy and publish the repo

**Files:**
- Create: `README.md` (Arabic: how to run, test, deploy; env keys; the D:-drive rule)
- Modify: `package.json` (script `"deploy": "npm run build && firebase deploy --only hosting,firestore:rules"`)

**Interfaces:**
- Consumes: Task 5 `firebase.json`.
- Produces: live URL `https://<project-id>.web.app`; GitHub repo with all commits.

- [ ] **Step 1: Run** `npm test` and `npm run test:rules` → both PASS (gate before deploy).
- [ ] **Step 2: Run** `npm run deploy`. Expected: «Deploy complete!» with a Hosting URL.
- [ ] **Step 3: Verify live:** open the URL. `/` shows «وصال» in the Arabic font, RTL. `/identity` loads (SPA rewrite works). Browser console has no errors.
- [ ] **Step 4: Human step.** The user creates an empty GitHub repo (name e.g. `wesal-app`, separate from the prototype repo) and approves the push.
- [ ] **Step 5: Run** `git remote add origin <url>` and `git push -u origin main`. Expected: the branch appears on GitHub with all six task commits.
- [ ] **Step 6: Commit** README and deploy script: `git commit -m "docs: README and deploy script"`, then push.

---

## Done when (phase ٠ per spec)

- Identity approved by the team (Task 4 gate).
- Site live on Firebase Hosting, connected to Firebase, Firestore deny-all proven by tests.
- Separate GitHub repo holds the code; no code or design from the prototype.
