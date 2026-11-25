import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { StockRow, Warehouse } from '../../src/features/inventory/types'
import type { Org } from '../../src/features/orgs/types'

const ORG = { role: 'charity', name: 'جمعية البر', status: 'approved', city: 'جدة' } as Org
const wh = (id: string, name: string, district: string, n: number): Warehouse => ({ id, name, city: 'جدة', district, location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(2026, 10, n), updatedAt: new Date() })
const W1 = wh('w1', 'المستودع الرئيسي', 'النعيم', 1)
const W2 = wh('w2', 'مستودع الحمدانية', 'الحمدانية', 2)
const row = (w: Warehouse, item: { key: string; name: string }, condition: 'new' | 'used', qty: number): StockRow => ({
  id: `${w.id}__${item.key}__${condition}`, orgId: 'c1', orgName: ORG.name, orgRole: 'charity', warehouseId: w.id, warehouseName: w.name, city: w.city,
  itemId: item.key, itemName: item.name, condition, qty, reserved: 0, updatedAt: new Date(),
})

function renderAt(seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({ users: [{ uid: 'c1', email: 'c@test.sa', password: 'x' }], orgs: { c1: ORG }, signedIn: 'c1', ...seed })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={['/app']}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}

const stocked = () => renderAt({
  warehouses: { c1: [W1, W2] },
  stock: [row(W1, SEED_ITEMS[0], 'new', 40), row(W1, SEED_ITEMS[0], 'used', 12), row(W1, SEED_ITEMS[3], 'new', 0), row(W2, SEED_ITEMS[1], 'new', 5)],
})
const card = (name: string) => screen.getByRole('region', { name })

describe('my stock page', () => {
  it('shows the empty state with no warehouses', async () => {
    renderAt()
    expect(await screen.findByRole('heading', { name: 'ابدأ بإضافة أول مستودع' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'أضف مستودع' })).toBeInTheDocument()
  })

  it('lists warehouses with their rows and totals', async () => {
    stocked()
    expect(await screen.findByRole('region', { name: 'المستودع الرئيسي' })).toBeInTheDocument()
    expect(within(card('مستودع الحمدانية')).getByText('أجهزة تنفس')).toBeInTheDocument()
    expect(within(card('المستودع الرئيسي')).getAllByText('كراسي متحركة')).toHaveLength(2)
    expect(screen.getByText('إجمالي القطع').nextSibling).toHaveTextContent('57')
    expect(screen.getByText('المستودعات').nextSibling).toHaveTextContent('2')
  })

  it('zero quantity reads نفد', async () => {
    stocked()
    const c = await screen.findByRole('region', { name: 'المستودع الرئيسي' })
    expect(within(c).getByText('نفد')).toBeInTheDocument()
  })

  it('adds a product through the dialog', async () => {
    const { user } = stocked()
    const c = await screen.findByRole('region', { name: 'مستودع الحمدانية' })
    await user.click(within(c).getByRole('button', { name: 'إضافة منتج إلى مستودع الحمدانية' }))
    await user.type(screen.getByRole('combobox', { name: 'المنتج' }), 'عكازات')
    await user.click(screen.getByRole('option', { name: 'أضف «عكازات» كمنتج جديد' }))
    await user.type(screen.getByRole('textbox', { name: 'الكمية' }), '30')
    await user.click(screen.getByRole('button', { name: 'حفظ' }))
    expect(await within(card('مستودع الحمدانية')).findByText('عكازات')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deletes a row after confirming', async () => {
    const { user } = stocked()
    const c = await screen.findByRole('region', { name: 'مستودع الحمدانية' })
    await user.click(within(c).getByRole('button', { name: 'حذف أجهزة تنفس جديد' }))
    const d = screen.getByRole('dialog', { name: 'حذف منتج' })
    expect(d).toHaveTextContent('حذف «أجهزة تنفس · جديد» من مستودع الحمدانية؟')
    await user.click(within(d).getByRole('button', { name: 'حذف' }))
    expect(await within(card('مستودع الحمدانية')).findByText('ما فيه منتجات في هذا المستودع للحين')).toBeInTheDocument()
  })

  it('shows an error instead of spinning when stock cannot load', async () => {
    renderAt({ failures: { inventory: true } })
    expect(await screen.findByText('تعذّر تحميل المخزون، تأكد من الاتصال وحاول مرة ثانية')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('nav shows مخزوني and no shared stock page', async () => {
    renderAt()
    expect(await screen.findByRole('link', { name: 'مخزوني' })).toHaveAttribute('href', '/app')
    expect(screen.queryByRole('link', { name: 'مخزون الجهات' })).not.toBeInTheDocument()
  })

  it('the old shared stock address leads back to مخزوني', async () => {
    const s = createFakeServices({ users: [{ uid: 'c1', email: 'c@test.sa', password: 'x' }], orgs: { c1: ORG }, signedIn: 'c1' })
    render(<ServicesProvider services={s}><MemoryRouter initialEntries={['/app/network']}><App /></MemoryRouter></ServicesProvider>)
    expect(await screen.findByRole('heading', { name: 'مخزوني' })).toBeInTheDocument()
  })

  it('charity copy says hospitals see the stock when they request', async () => {
    renderAt()
    expect(await screen.findByText('المستشفيات تشوف الكميات المتاحة عندك لما تطلب منتج')).toBeInTheDocument()
  })

  it('hospital copy says its stock is private', async () => {
    const s = createFakeServices({ users: [{ uid: 'h1', email: 'h@test.sa', password: 'x' }], orgs: { h1: { ...ORG, role: 'hospital', name: 'مستشفى الملك فهد' } as Org }, signedIn: 'h1' })
    render(<ServicesProvider services={s}><MemoryRouter initialEntries={['/app']}><App /></MemoryRouter></ServicesProvider>)
    expect(await screen.findByText('مخزونك يظهر لك بس')).toBeInTheDocument()
  })
})
