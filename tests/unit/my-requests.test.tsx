import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const ORGS: Record<string, Org> = {
  h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved', city: 'جدة' } as Org,
  h2: { role: 'hospital', name: 'مستشفى الولادة', status: 'approved', city: 'جدة' } as Org,
}
const req = (id: string, over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id, hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: 'k', itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 30,
  neededBy: new Date(2026, 10, 27), receiver: { name: 'أحمد الغامدي', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' },
  status: 1, charityId: 'c1', charityName: 'جمعية الشمال', warehouseId: 'w1', createdAt: new Date(2026, 10, 25, 10), updatedAt: new Date(), ...over,
})
const REQS = [
  req('r1'),
  req('r2', { itemName: 'أجهزة تنفس', qty: 5, priority: 'normal', status: 0, charityId: undefined, charityName: undefined, warehouseId: undefined, createdAt: new Date(2026, 10, 25, 12) }),
  req('r3', { hospitalId: 'h2', hospitalName: 'مستشفى الولادة', itemName: 'أسرّة طبية' }),
]

function renderAt(path: string, seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({ users: [{ uid: 'h1', email: 'h@t.sa', password: 'x' }], orgs: ORGS, signedIn: 'h1', requests: REQS, codes: { r1: '4827', r2: '0193', r3: '5555' }, ...seed })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return userEvent.setup()
}

describe('my requests', () => {
  it('lists requests newest first with status', async () => {
    renderAt('/app')
    const list = await screen.findByRole('list', { name: 'طلباتي' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('أجهزة تنفس')
    expect(rows[0]).toHaveTextContent('طلب مفتوح')
    expect(rows[1]).toHaveTextContent('جمعية الشمال')
    expect(rows[1]).toHaveTextContent('بانتظار موافقة الجمعية')
    expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', '/app/requests/r1')
    expect(screen.queryByText('أسرّة طبية')).not.toBeInTheDocument()
    expect(screen.getByText('طلبات مفتوحة').nextSibling).toHaveTextContent('1')
  })

  it('empty state offers a new request', async () => {
    const user = renderAt('/app', { requests: [] })
    expect(await screen.findByText('ما عندك طلبات للحين')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'طلب جديد' })[0])
    expect(await screen.findByRole('heading', { name: 'طلب جديد' })).toBeInTheDocument()
  })

  it('details show fields and the receipt code', async () => {
    renderAt('/app/requests/r1')
    expect(await screen.findByRole('heading', { name: 'كراسي متحركة · 40' })).toBeInTheDocument()
    expect(await screen.findByLabelText('رمز الاستلام')).toHaveTextContent('4827')
    for (const t of ['جمعية الشمال', 'أحمد الغامدي', 'جديد او مستعمل', 'جدة، الشرفية · البوابة 3']) expect(screen.getByText(t)).toBeInTheDocument()
    expect(screen.getAllByText('بانتظار موافقة الجمعية').length).toBeGreaterThan(0)
  })

  it("another hospital's request id shows not found", async () => {
    renderAt('/app/requests/r3')
    expect(await screen.findByText('ما لقينا هذا الطلب')).toBeInTheDocument()
    expect(screen.queryByText('5555')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'رجوع لطلباتي' })).toHaveAttribute('href', '/app')
  })

  it('load error shows a message', async () => {
    renderAt('/app', { failures: { requests: true } })
    expect(await screen.findByText('تعذّر تحميل الطلبات، حاول مرة ثانية')).toBeInTheDocument()
  })
})
