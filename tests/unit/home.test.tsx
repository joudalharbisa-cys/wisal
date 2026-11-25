import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Org } from '../../src/features/orgs/types'

function renderAs(role: Org['role'], path = '/app') {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'u@t.sa', password: 'x' }], orgs: { u1: { role, name: 'جهة', status: 'approved', city: 'جدة' } as Org }, signedIn: 'u1' })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
}

it('hospital home is طلباتي with مخزوني in the nav', async () => {
  renderAs('hospital')
  expect(await screen.findByRole('heading', { name: 'طلباتي' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'طلباتي' })).toHaveAttribute('href', '/app')
  expect(screen.getByRole('link', { name: 'مخزوني' })).toHaveAttribute('href', '/app/stock')
})

it('hospital stock page lives at /app/stock', async () => {
  renderAs('hospital', '/app/stock')
  expect(await screen.findByRole('heading', { name: 'مخزوني' })).toBeInTheDocument()
})

it('charity home stays مخزوني and has no طلباتي link', async () => {
  renderAs('charity')
  expect(await screen.findByRole('heading', { name: 'مخزوني' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'مخزوني' })).toHaveAttribute('href', '/app')
  expect(screen.queryByRole('link', { name: 'طلباتي' })).not.toBeInTheDocument()
})
