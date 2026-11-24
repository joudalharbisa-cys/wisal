import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { Org } from '../../src/features/orgs/types'

const base = {
  role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov',
  contactEmail: 'h@test.sa', contract: { version: '1.0-draft', acceptedAt: new Date(), acceptedByName: 'أحمد' },
  createdAt: new Date(Date.UTC(2026, 10, 24)), updatedAt: new Date(),
} as const

function setup(org: Org) {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'x' }], orgs: { u1: org }, signedIn: 'u1', admins: [] })
  render(
    <ServicesProvider services={s}>
      <MemoryRouter initialEntries={['/pending']}><App /></MemoryRouter>
    </ServicesProvider>,
  )
  return s
}

it('pending application shows the review message and the org name', async () => {
  setup({ ...base, status: 'pending' } as Org)
  expect(await screen.findByRole('heading', { name: 'طلبك قيد المراجعة' })).toBeInTheDocument()
  expect(screen.getAllByRole('definition')[0]).toHaveTextContent('مستشفى الملك فهد')
})

it('rejected application shows the reason', async () => {
  setup({ ...base, status: 'rejected', rejectReason: 'الترخيص منتهي' } as Org)
  expect(await screen.findByText(/الترخيص منتهي/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'تعديل وإعادة الإرسال' })).toBeInTheDocument()
})

it('rejected owner edits and resubmits, then sees the pending message', async () => {
  const s = setup({ ...base, status: 'rejected', rejectReason: 'الترخيص منتهي' } as Org)
  const resubmit = vi.spyOn(s.orgs, 'resubmit')
  await userEvent.click(await screen.findByRole('button', { name: 'تعديل وإعادة الإرسال' }))
  const name = screen.getByLabelText('اسم الجهة')
  await userEvent.clear(name)
  await userEvent.type(name, 'مستشفى الملك فهد العام')
  await userEvent.click(screen.getByRole('button', { name: 'إعادة الإرسال' }))
  expect(await screen.findByRole('heading', { name: 'طلبك قيد المراجعة' })).toBeInTheDocument()
  expect(resubmit).toHaveBeenCalledTimes(1)
  expect(resubmit.mock.calls[0][0]).toBe('u1')
  expect(resubmit.mock.calls[0][1]).toMatchObject({ name: 'مستشفى الملك فهد العام', role: 'hospital' })
})

it('an invalid edit is not sent', async () => {
  const s = setup({ ...base, status: 'rejected', rejectReason: 'الترخيص منتهي' } as Org)
  const resubmit = vi.spyOn(s.orgs, 'resubmit')
  await userEvent.click(await screen.findByRole('button', { name: 'تعديل وإعادة الإرسال' }))
  await userEvent.clear(screen.getByLabelText('اسم الجهة'))
  await userEvent.click(screen.getByRole('button', { name: 'إعادة الإرسال' }))
  expect(screen.getByText('اكتب اسم الجهة')).toBeInTheDocument()
  expect(resubmit).not.toHaveBeenCalled()
})

it('moves to the app home as soon as the admin approves', async () => {
  const s = setup({ ...base, status: 'pending' } as Org)
  await screen.findByRole('heading', { name: 'طلبك قيد المراجعة' })
  await act(() => s.admin.approve('u1', 'a1'))
  expect(await screen.findByRole('heading', { name: 'أهلًا، مستشفى الملك فهد' })).toBeInTheDocument()
})
