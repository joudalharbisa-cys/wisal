import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Org } from '../../src/features/orgs/types'

const pendingOrg = (name: string, minute: number, extra: Partial<Org> = {}) => ({
  role: 'hospital', name, city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov',
  status: 'pending', contactEmail: 'x@test.sa',
  contract: { version: '1.0-draft', acceptedAt: new Date(), acceptedByName: 'أحمد الغامدي' },
  createdAt: new Date(Date.UTC(2026, 10, 24, 9, minute)), updatedAt: new Date(), ...extra,
} as Org)

function setup(orgs: Record<string, Org> = { u1: pendingOrg('مستشفى الملك فهد', 1), u2: pendingOrg('جمعية الشمال', 2, { role: 'charity', hospitalType: undefined, workingHours: 'الأحد-الخميس', canDeliver: true }) }) {
  const s = createFakeServices({ users: [{ uid: 'a1', email: 'admin@test.sa', password: 'x' }], admins: ['a1'], signedIn: 'a1', orgs })
  render(
    <ServicesProvider services={s}>
      <MemoryRouter initialEntries={['/admin']}><App /></MemoryRouter>
    </ServicesProvider>,
  )
  return s
}

const card = (name: string) => within(screen.getByRole('article', { name }))

it('lists pending applications oldest first', async () => {
  setup()
  await screen.findByRole('heading', { name: 'طلبات التسجيل' })
  const articles = await screen.findAllByRole('article')
  expect(articles.map(a => a.getAttribute('aria-label'))).toEqual(['مستشفى الملك فهد', 'جمعية الشمال'])
  expect(card('جمعية الشمال').getByText('جمعية')).toBeInTheDocument()
})

it('approve sends one decision and the application leaves the list', async () => {
  const s = setup()
  const approve = vi.spyOn(s.admin, 'approve')
  await screen.findAllByRole('article')
  await userEvent.dblClick(card('مستشفى الملك فهد').getByRole('button', { name: 'قبول' }))
  expect(approve).toHaveBeenCalledTimes(1)
  expect(approve).toHaveBeenCalledWith('u1', 'a1')
  expect(screen.queryByRole('article', { name: 'مستشفى الملك فهد' })).not.toBeInTheDocument()
})

it('reject requires a reason', async () => {
  const s = setup()
  const reject = vi.spyOn(s.admin, 'reject')
  await screen.findAllByRole('article')
  await userEvent.click(card('مستشفى الملك فهد').getByRole('button', { name: 'رفض' }))
  await userEvent.click(card('مستشفى الملك فهد').getByRole('button', { name: 'تأكيد الرفض' }))
  expect(card('مستشفى الملك فهد').getByText('اكتب سبب الرفض')).toBeInTheDocument()
  expect(reject).not.toHaveBeenCalled()
})

it('reject with a reason sends it', async () => {
  const s = setup()
  const reject = vi.spyOn(s.admin, 'reject')
  await screen.findAllByRole('article')
  await userEvent.click(card('مستشفى الملك فهد').getByRole('button', { name: 'رفض' }))
  await userEvent.type(card('مستشفى الملك فهد').getByLabelText('سبب الرفض'), 'الترخيص منتهي')
  await userEvent.click(card('مستشفى الملك فهد').getByRole('button', { name: 'تأكيد الرفض' }))
  expect(reject).toHaveBeenCalledWith('u1', 'a1', 'الترخيص منتهي')
})

it('shows an empty state when nothing is pending', async () => {
  setup({})
  expect(await screen.findByText('ما فيه طلبات جديدة')).toBeInTheDocument()
})
