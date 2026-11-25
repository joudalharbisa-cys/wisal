import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { StockRow } from '../../src/features/inventory/types'
import type { Org } from '../../src/features/orgs/types'

const approved = (role: Org['role'], name: string) => ({ role, name, status: 'approved', city: 'جدة' }) as Org
const ORGS = { h1: approved('hospital', 'مستشفى الملك فهد'), c1: approved('charity', 'جمعية البر'), c2: approved('charity', 'جمعية الشمال') }
const [CHAIRS, VENT] = SEED_ITEMS
const row = (orgId: keyof typeof ORGS, item: { key: string; name: string }, qty: number, reserved = 0, wh = 'المستودع الرئيسي'): StockRow => ({
  id: `w-${orgId}-${item.key}`, orgId, orgName: ORGS[orgId].name, orgRole: ORGS[orgId].role, warehouseId: `w-${orgId}`, warehouseName: wh, city: 'جدة',
  itemId: item.key, itemName: item.name, condition: 'new', qty, reserved, updatedAt: new Date(),
})
const STOCK = [row('c2', CHAIRS, 65), row('h1', CHAIRS, 6), row('c1', VENT, 5), row('c1', CHAIRS, 4, 4), row('c2', VENT, 0)]

function renderAt(path: string, seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({
    users: [{ uid: 'h1', email: 'h@test.sa', password: 'x' }, { uid: 'a1', email: 'a@test.sa', password: 'x' }],
    orgs: ORGS, admins: ['a1'], signedIn: 'h1', stock: STOCK, ...seed,
  })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return userEvent.setup()
}
const orgCards = () => screen.getAllByRole('region')

describe('network stock page', () => {
  it('groups rows by org with role badges', async () => {
    renderAt('/app/network')
    const north = await screen.findByRole('region', { name: /جمعية الشمال/ })
    expect(within(north).getByText('جمعية')).toBeInTheDocument()
    expect(within(north).getByText('65')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /مستشفى الملك فهد/ })).getByText('مستشفى')).toBeInTheDocument()
  })

  it('own org comes first marked أنت', async () => {
    renderAt('/app/network')
    await screen.findByRole('region', { name: /جمعية الشمال/ })
    expect(orgCards()[0]).toHaveAccessibleName(/مستشفى الملك فهد/)
    expect(within(orgCards()[0]).getByText('أنت')).toBeInTheDocument()
  })

  it('hides rows with nothing available', async () => {
    renderAt('/app/network')
    const bir = await screen.findByRole('region', { name: /جمعية البر/ })
    expect(within(bir).queryByText('كراسي متحركة')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /جمعية الشمال/ })).queryByText('أجهزة تنفس')).not.toBeInTheDocument()
    expect(screen.getByText(/قطعة متاحة/)).toHaveTextContent('76 قطعة متاحة عند 3 جهات')
  })

  it('search matches normalised names', async () => {
    const user = renderAt('/app/network')
    const search = await screen.findByRole('searchbox', { name: 'ابحث بالمنتج' })
    await user.type(search, 'الكراسي')
    expect(screen.queryByRole('region', { name: /جمعية البر/ })).not.toBeInTheDocument()
    expect(orgCards()).toHaveLength(2)
    await user.clear(search)
    await user.type(search, 'أجهزه')
    expect(orgCards()).toHaveLength(1)
    await user.clear(search)
    await user.type(search, 'عكازات')
    expect(screen.getByText('ما فيه مخزون يطابق بحثك')).toBeInTheDocument()
  })

  it('admin sees the page at /admin/network', async () => {
    renderAt('/admin/network', { signedIn: 'a1' })
    expect(await screen.findByRole('heading', { name: 'مخزون الجهات' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مخزون الجهات' })).toHaveAttribute('href', '/admin/network')
    expect(await screen.findByRole('region', { name: /جمعية الشمال/ })).toBeInTheDocument()
    expect(screen.queryByText('أنت')).not.toBeInTheDocument()
  })

  it('shows an error when stock cannot load', async () => {
    renderAt('/app/network', { failures: { allStock: true } })
    expect(await screen.findByText('تعذّر تحميل المخزون')).toBeInTheDocument()
  })
})
