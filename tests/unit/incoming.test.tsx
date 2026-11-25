import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
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
const ROW: StockRow = { id: `wa__${CH.key}__new`, orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wa', warehouseName: W.name, city: 'جدة', itemId: CH.key, itemName: CH.name, condition: 'new', qty: 50, reserved: 0, updatedAt: new Date() }
const req = (id: string, over: Partial<HospitalRequest>): HospitalRequest => ({
  id, hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: CH.key, itemName: CH.name, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 10, 27), delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: '' },
  status: 1, open: false, excluded: [], createdAt: new Date(2026, 10, 25, 9), updatedAt: new Date(2026, 10, 25, 9), ...over,
})
const REQS = [
  req('r1', { charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', itemName: 'كراسي متحركة' }),
  req('r2', { status: 0, open: true, qty: 10, itemName: 'كراسي للمفتوح' }),
  req('r3', { status: 0, open: true, qty: 999, itemName: 'طلب كبير' }),
  req('r4', { status: 2, charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', itemName: 'طلب مقبول' }),
  req('r5', { charityId: 'c2', charityName: 'جمعية الشمال', warehouseId: 'wb', itemName: 'لجمعية ثانية' }),
  req('r6', { status: 0, open: false, excluded: ['c1'], itemName: 'مرفوض ينتظر المستشفى' }),
]

function renderAt(seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({ users: [{ uid: 'c1', email: 'c@t.sa', password: 'x' }], orgs: ORGS, signedIn: 'c1', warehouses: { c1: [W] }, stock: [ROW], requests: REQS, ...seed })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={['/app']}><App /></MemoryRouter></ServicesProvider>)
  return userEvent.setup()
}
const list = () => screen.getByRole('tabpanel')

describe('charity incoming requests', () => {
  it('charity home is الطلبات الواردة with a waiting badge', async () => {
    renderAt()
    expect(await screen.findByRole('heading', { name: 'الطلبات الواردة' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /^الطلبات الواردة\s*1$/ })).toHaveAttribute('href', '/app')
  })

  it('tabs list addressed, all open (uncoverable marked, last) and accepted requests', async () => {
    const user = renderAt()
    await screen.findByRole('tabpanel')
    expect(await within(list()).findByText(/كراسي متحركة/)).toBeInTheDocument()
    expect(within(list()).getByText('مستشفى الملك فهد')).toBeInTheDocument()
    expect(within(list()).queryByText(/لجمعية ثانية/)).not.toBeInTheDocument()
    expect(within(list()).getByRole('link')).toHaveAttribute('href', '/app/incoming/r1')
    await user.click(screen.getByRole('tab', { name: /مفتوحة/ }))
    expect(await within(list()).findByText(/كراسي للمفتوح/)).toBeInTheDocument()
    // Every open request shows; the ones its stock can't cover say so and come after.
    const rows = within(list()).getAllByRole('listitem')
    expect(rows.map(x => x.textContent?.includes('طلب كبير'))).toEqual([false, true])
    expect(rows[1]).toHaveTextContent('ما عندك كمية تكفي في مخزونك')
    expect(rows[0]).not.toHaveTextContent('ما عندك كمية تكفي')
    expect(within(list()).queryByText(/مرفوض ينتظر المستشفى/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /قبلتها/ }))
    expect(await within(list()).findByText(/طلب مقبول/)).toBeInTheDocument()
  })

  it('accepted rows show the latest step with its date', async () => {
    const user = renderAt({ requests: [req('r4', { status: 3, mode: 'delivery', charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', itemName: 'طلب مقبول', acceptedAt: new Date(2026, 10, 25, 11), preparingAt: new Date(2026, 10, 26, 8, 15) })] })
    await screen.findByRole('tabpanel')
    await user.click(screen.getByRole('tab', { name: /قبلتها/ }))
    const row = within(list()).getByRole('listitem')
    expect(row).toHaveTextContent('بدأ التجهيز')
    expect(row).toHaveTextContent('26 نوفمبر · 8:15 ص')
    expect(row).toHaveTextContent('تجهيز الطلب')
  })

  it('empty tab says so', async () => {
    renderAt({ requests: [] })
    expect(await screen.findByText('ما فيه طلبات تنتظر ردك')).toBeInTheDocument()
  })

  it('load error shows a message', async () => {
    renderAt({ failures: { requests: true } })
    expect(await screen.findByText('تعذّر تحميل الطلبات، حاول مرة ثانية')).toBeInTheDocument()
  })
})
