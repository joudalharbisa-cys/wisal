import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError } from '../../src/services/types'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { StockRow, Warehouse } from '../../src/features/inventory/types'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const ORGS: Record<string, Org> = {
  h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org,
  c1: { role: 'charity', name: 'جمعية البر', status: 'approved' } as Org,
  c2: { role: 'charity', name: 'جمعية الشمال', status: 'approved' } as Org,
}
const W: Warehouse = { id: 'wa', name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.572, lng: 39.17 }, createdAt: new Date(), updatedAt: new Date() }
const row = (qty: number, condition: 'new' | 'used' = 'new'): StockRow => ({ id: `wa__${CH.key}__${condition}`, orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wa', warehouseName: W.name, city: 'جدة', itemId: CH.key, itemName: CH.name, condition, qty, reserved: 0, updatedAt: new Date() })
const req = (id: string, over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id, hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: CH.key, itemName: CH.name, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 10, 27), delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' },
  status: 1, open: false, excluded: [], charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', createdAt: new Date(), updatedAt: new Date(), ...over,
})

function renderAt(id: string, seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({
    users: ['h1', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), orgs: ORGS, signedIn: 'c1',
    warehouses: { c1: [W] }, stock: [row(30), row(20, 'used')],
    requests: [req('r1'), req('r2', { status: 0, open: true, charityId: undefined, charityName: undefined, warehouseId: undefined }), req('r9', { charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'wb' })],
    contacts: { r1: { hospitalId: 'h1', name: 'أحمد الغامدي', phone: '0551234567' }, r2: { hospitalId: 'h1', name: 'سارة', phone: '0559876543' } },
    ...seed,
  })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[`/app/incoming/${id}`]}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}

describe('incoming request page', () => {
  it('accepting reserves and shows the receiver', async () => {
    const { s, user } = renderAt('r1')
    expect(await screen.findByRole('heading', { name: 'كراسي متحركة · 40' })).toBeInTheDocument()
    expect(screen.getByText(/بنحجز/)).toHaveTextContent('بنحجز 40 من المستودع الرئيسي')
    await user.click(screen.getByRole('button', { name: 'قبول' }))
    expect(await screen.findByText(/قبلت الطلب/)).toHaveTextContent('المستودع الرئيسي')
    expect(await screen.findByText('أحمد الغامدي')).toBeInTheDocument()
    expect(screen.getByText('0551234567')).toBeInTheDocument()
    expect(s._state.stock.get(`c1/wa__${CH.key}__new`)?.reserved).toBe(30)
  })

  it('short stock says so and disables accepting', async () => {
    renderAt('r1', { stock: [row(10)] })
    expect(await screen.findByText('الكمية ما تكفي في مستودعاتك الحين')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'قبول' })).toBeDisabled()
  })

  it('rejecting with a reason returns to the list', async () => {
    const { s, user } = renderAt('r1')
    await user.click(await screen.findByRole('button', { name: 'رفض' }))
    const d = screen.getByRole('dialog', { name: 'رفض الطلب' })
    await user.type(within(d).getByRole('textbox', { name: 'السبب (اختياري)' }), 'الكمية محجوزة')
    await user.click(within(d).getByRole('button', { name: 'رفض الطلب' }))
    expect(await screen.findByRole('heading', { name: 'الطلبات الواردة' })).toBeInTheDocument()
    expect(s._state.requests.get('r1')).toMatchObject({ status: 0, open: false, lastRejection: { reason: 'الكمية محجوزة' } })
  })

  it('taking an open request', async () => {
    const { s, user } = renderAt('r2')
    await user.click(await screen.findByRole('button', { name: 'أقبل الطلب' }))
    expect(await screen.findByText(/قبلت الطلب/)).toBeInTheDocument()
    expect(s._state.requests.get('r2')).toMatchObject({ status: 2, charityId: 'c1', warehouseId: 'wa' })
  })

  it('losing the race says another charity took it', async () => {
    const { s, user } = renderAt('r2')
    vi.spyOn(s.requests, 'accept').mockRejectedValue(new ServiceError('invalid-transition', 'taken'))
    await user.click(await screen.findByRole('button', { name: 'أقبل الطلب' }))
    expect(await screen.findByText('أخذته جمعية ثانية')).toBeInTheDocument()
  })

  it('when another charity takes the open request first, the page says so', async () => {
    const { s } = renderAt('r2')
    expect(await screen.findByRole('button', { name: 'أقبل الطلب' })).toBeInTheDocument()
    s._state.requests.set('r2', { ...s._state.requests.get('r2')!, status: 2, open: false, charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'wb' })
    await act(async () => s._emit())
    expect(await screen.findByText('أخذته جمعية ثانية')).toBeInTheDocument()
    expect(screen.queryByText('ما لقينا هذا الطلب')).not.toBeInTheDocument()
  })

  it('an old request keeps showing its receiver after accepting', async () => {
    const { user } = renderAt('r7', { requests: [{ ...req('r7'), legacyReceiver: { name: 'خالد', phone: '0550000000' } }], contacts: {} })
    await user.click(await screen.findByRole('button', { name: 'قبول' }))
    expect(await screen.findByText('خالد')).toBeInTheDocument()
  })

  it('a request for another charity shows not found', async () => {
    renderAt('r9')
    expect(await screen.findByText('ما لقينا هذا الطلب')).toBeInTheDocument()
  })

  it('hospital is sent away', async () => {
    renderAt('r1', { signedIn: 'h1' })
    expect(await screen.findByRole('heading', { name: 'طلباتي' })).toBeInTheDocument()
  })
})
