import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { it, expect } from 'vitest'
import { Guard } from '../../src/session/Guard'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Org } from '../../src/features/orgs/types'

const approvedOrg = { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org

function renderAt(path: string, services: ReturnType<typeof createFakeServices>) {
  return render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[path]}>
        <Guard>
          <Routes>
            <Route path="/login" element={<h1>صفحة الدخول</h1>} />
            <Route path="/register" element={<h1>صفحة التسجيل</h1>} />
            <Route path="/app" element={<h1>الرئيسية</h1>} />
          </Routes>
        </Guard>
      </MemoryRouter>
    </ServicesProvider>,
  )
}

it('approved member opening /login lands on the app', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'x' }], orgs: { u1: approvedOrg }, signedIn: 'u1' })
  renderAt('/login', s)
  expect(await screen.findByRole('heading', { name: 'الرئيسية' })).toBeInTheDocument()
})

it('anonymous visitor opening /app lands on login', async () => {
  renderAt('/app', createFakeServices())
  expect(await screen.findByRole('heading', { name: 'صفحة الدخول' })).toBeInTheDocument()
})

it('signed-in user without an org is sent back to registration', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'x' }], signedIn: 'u1' })
  renderAt('/app', s)
  expect(await screen.findByRole('heading', { name: 'صفحة التسجيل' })).toBeInTheDocument()
})

it('shows a spinner while the session loads', () => {
  renderAt('/app', createFakeServices())
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('a failed admin check shows a retry screen instead of registration', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'x' }], signedIn: 'u1', failures: { isAdmin: true } })
  renderAt('/app', s)
  expect(await screen.findByText('تعذّر تحميل حسابك')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'حاول مرة ثانية' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'صفحة التسجيل' })).not.toBeInTheDocument()
})

it('a failed org listener shows the retry screen, not registration', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'x' }], signedIn: 'u1', failures: { watchOrg: true } })
  renderAt('/app', s)
  expect(await screen.findByText('تعذّر تحميل حسابك')).toBeInTheDocument()
})
