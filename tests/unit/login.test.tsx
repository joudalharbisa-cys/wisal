import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Org } from '../../src/features/orgs/types'

function setup() {
  const s = createFakeServices({
    users: [{ uid: 'u1', email: 'h@test.sa', password: 'password123' }],
    orgs: { u1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org },
  })
  render(
    <ServicesProvider services={s}>
      <MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>
    </ServicesProvider>,
  )
  return s
}

it('shows an Arabic error for a wrong password', async () => {
  setup()
  await userEvent.type(await screen.findByLabelText('البريد الإلكتروني'), 'h@test.sa')
  await userEvent.type(screen.getByLabelText('كلمة المرور'), 'wrong-pass')
  await userEvent.click(screen.getByRole('button', { name: 'دخول' }))
  expect(await screen.findByText('البريد أو كلمة المرور غير صحيحة')).toBeInTheDocument()
})

it('requires email and password before calling the backend', async () => {
  const s = setup()
  const spy = vi.spyOn(s.auth, 'signIn')
  await userEvent.click(await screen.findByRole('button', { name: 'دخول' }))
  expect(screen.getByText('اكتب البريد الإلكتروني')).toBeInTheDocument()
  expect(screen.getByText('اكتب كلمة المرور')).toBeInTheDocument()
  expect(spy).not.toHaveBeenCalled()
})

it('approved member signs in and lands on the app home', async () => {
  setup()
  await userEvent.type(await screen.findByLabelText('البريد الإلكتروني'), 'h@test.sa')
  await userEvent.type(screen.getByLabelText('كلمة المرور'), 'password123')
  await userEvent.click(screen.getByRole('button', { name: 'دخول' }))
  expect(await screen.findByRole('heading', { name: 'مخزوني' })).toBeInTheDocument()
})

it('links to registration', async () => {
  setup()
  expect(await screen.findByRole('link', { name: 'سجّل مستشفى أو جمعية' })).toHaveAttribute('href', '/register')
})
