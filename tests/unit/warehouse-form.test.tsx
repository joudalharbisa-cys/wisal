import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { LatLng, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { Org } from '../../src/features/orgs/types'

// jsdom has no layout, so the Leaflet map is replaced by a button that drops a pin.
vi.mock('../../src/features/inventory/LocationMap', () => ({
  default: ({ onChange }: { onChange: (v: LatLng) => void }) => <button type="button" onClick={() => onChange({ lat: 21.62, lng: 39.15 })}>ضع الدبوس</button>,
}))

// Address lookup answers only when a test resolves it, so typing can happen before the answer arrives.
let resolveGeo: (v: { city?: string; district?: string } | null) => void = () => {}
vi.mock('../../src/features/geo/reverseGeocode', () => ({
  defaultGeocoder: () => new Promise(r => { resolveGeo = r }),
}))

const ORG ={ role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved', city: 'جدة' } as Org
const W1: Warehouse = { id: 'w1', name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.6, lng: 39.1 }, createdAt: new Date(), updatedAt: new Date() }
const row = (key: string): StockRow => ({ id: `w1__${key}__new`, orgId: 'h1', orgName: ORG.name, orgRole: 'hospital', warehouseId: 'w1', warehouseName: W1.name, city: 'جدة', itemId: key, itemName: key, condition: 'new', qty: 3, reserved: 0, updatedAt: new Date() })

function renderAt(path: string, seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({ users: [{ uid: 'h1', email: 'h@test.sa', password: 'x' }], orgs: { h1: ORG }, signedIn: 'h1', ...seed })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}
const setGeo = (impl: Partial<Geolocation> | undefined) => Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true })
afterEach(() => setGeo(undefined))

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('اسم المستودع'), 'مستودع الشرفية')
  await user.type(screen.getByLabelText('الحي'), 'الشرفية')
}

describe('warehouse form', () => {
  it('saves a new warehouse and returns to مخزوني', async () => {
    const { user } = renderAt('/app/warehouses/new')
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'ضع الدبوس' }))
    await user.click(screen.getByRole('button', { name: 'حفظ المستودع' }))
    expect(await screen.findByRole('heading', { name: 'مخزوني' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'مستودع الشرفية' })).toHaveTextContent('جدة، الشرفية')
  })

  it('location can be typed instead of using the map', async () => {
    const { user } = renderAt('/app/warehouses/new')
    await fillValid(user)
    await user.type(screen.getByRole('textbox', { name: 'خط العرض' }), '21.55')
    await user.type(screen.getByRole('textbox', { name: 'خط الطول' }), '٣٩٫١٧')
    await user.click(screen.getByRole('button', { name: 'حفظ المستودع' }))
    expect(await screen.findByRole('region', { name: 'مستودع الشرفية' })).toBeInTheDocument()
  })

  it('placing the pin fills district and city', async () => {
    const { user } = renderAt('/app/warehouses/new')
    await user.click(await screen.findByRole('button', { name: 'ضع الدبوس' }))
    await act(async () => resolveGeo({ city: 'مكة المكرمة', district: 'العزيزية' }))
    expect(screen.getByLabelText('الحي')).toHaveValue('العزيزية')
    expect(screen.getByLabelText('المدينة')).toHaveValue('مكة المكرمة')
  })

  it('a district typed after the pin is kept', async () => {
    const { user } = renderAt('/app/warehouses/new')
    await user.click(await screen.findByRole('button', { name: 'ضع الدبوس' }))
    await user.type(screen.getByLabelText('الحي'), 'النسيم')
    await act(async () => resolveGeo({ city: 'جدة', district: 'الشرفية' }))
    expect(screen.getByLabelText('الحي')).toHaveValue('النسيم')
  })

  it('shows validation messages', async () => {
    const { user } = renderAt('/app/warehouses/new')
    await user.click(await screen.findByRole('button', { name: 'حفظ المستودع' }))
    expect(screen.getByText('اكتب اسم المستودع (حرفين على الأقل)')).toBeInTheDocument()
    expect(screen.getByText('اكتب الحي')).toBeInTheDocument()
    expect(screen.getByText('حدد موقع المستودع على الخريطة')).toBeInTheDocument()
  })

  it('my location fills the pin', async () => {
    setGeo({ getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 21.5012, longitude: 39.2234 } } as GeolocationPosition) } as Partial<Geolocation>)
    const { user } = renderAt('/app/warehouses/new')
    await user.click(await screen.findByRole('button', { name: 'موقعي الحالي' }))
    expect(screen.getByRole('textbox', { name: 'خط العرض' })).toHaveValue('21.5012')
    expect(screen.getByRole('textbox', { name: 'خط الطول' })).toHaveValue('39.2234')
  })

  it('denied location shows a message and keeps manual pin', async () => {
    setGeo({ getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback | null) => fail?.({ code: 1 } as GeolocationPositionError) } as Partial<Geolocation>)
    const { user } = renderAt('/app/warehouses/new')
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'موقعي الحالي' }))
    expect(screen.getByText('ما قدرنا نحدد موقعك، حرّك الدبوس يدويًا')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ضع الدبوس' }))
    await user.click(screen.getByRole('button', { name: 'حفظ المستودع' }))
    expect(await screen.findByRole('heading', { name: 'مخزوني' })).toBeInTheDocument()
  })

  it('edit page deletes after confirming with the row count', async () => {
    const { user } = renderAt('/app/warehouses/w1', { warehouses: { h1: [W1] }, stock: [row('عكازات'), row('أسره')] })
    expect(await screen.findByLabelText('اسم المستودع')).toHaveValue('المستودع الرئيسي')
    await user.click(screen.getByRole('button', { name: 'حذف المستودع' }))
    const d = screen.getByRole('dialog', { name: 'حذف المستودع' })
    expect(d).toHaveTextContent('حذف المستودع ومعه 2 منتج؟')
    await user.click(within(d).getByRole('button', { name: 'حذف' }))
    expect(await screen.findByRole('heading', { name: 'ابدأ بإضافة أول مستودع' })).toBeInTheDocument()
  })

  it('edit page shows an error when the warehouse cannot load', async () => {
    renderAt('/app/warehouses/w1', { warehouses: { h1: [W1] }, failures: { inventory: true } })
    expect(await screen.findByText('تعذّر تحميل المخزون، تأكد من الاتصال وحاول مرة ثانية')).toBeInTheDocument()
  })

  it('a warehouse holding reserved stock cannot be deleted', async () => {
    const { user } = renderAt('/app/warehouses/w1', { warehouses: { h1: [W1] }, stock: [{ ...row('عكازات'), reserved: 2 }] })
    await user.click(await screen.findByRole('button', { name: 'حذف المستودع' }))
    const d = screen.getByRole('dialog', { name: 'حذف المستودع' })
    expect(d).toHaveTextContent('فيه كمية محجوزة لطلب في هذا المستودع، ما تقدر تحذفه الحين')
    expect(within(d).queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument()
  })

  it('unknown warehouse id shows not found', async () => {
    renderAt('/app/warehouses/nope', { warehouses: { h1: [W1] } })
    expect(await screen.findByText('ما لقينا هذا المستودع')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'رجوع لمخزوني' })).toHaveAttribute('href', '/app/stock')
  })
})
