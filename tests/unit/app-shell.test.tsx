import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Org } from '../../src/features/orgs/types'

const org = (role: Org['role'], name: string) => ({ role, name, status: 'approved' } as Org)

function renderApp(path: string, services: ReturnType<typeof createFakeServices>) {
  return render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </ServicesProvider>,
  )
}

it('approved hospital sees its home and can sign out to the login page', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'x' }], orgs: { u1: org('hospital', 'مستشفى الملك فهد') }, signedIn: 'u1' })
  renderApp('/app', s)
  expect(await screen.findByRole('heading', { name: 'أهلًا، مستشفى الملك فهد' })).toBeInTheDocument()
  expect(screen.getByText('ما عندك طلبات للحين. الطلبات تبدأ في المرحلة الجاية.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }))
  expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument()
})

it('approved charity sees the charity empty state', async () => {
  const s = createFakeServices({ users: [{ uid: 'c1', email: 'c@test.sa', password: 'x' }], orgs: { c1: org('charity', 'جمعية الشمال') }, signedIn: 'c1' })
  renderApp('/app', s)
  expect(await screen.findByRole('heading', { name: 'أهلًا، جمعية الشمال' })).toBeInTheDocument()
  expect(screen.getByText('ما فيه طلبات واردة للحين.')).toBeInTheDocument()
})

it('root path sends an anonymous visitor to login', async () => {
  renderApp('/', createFakeServices())
  expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument()
})
