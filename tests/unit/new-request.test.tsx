import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { LatLng, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { Org } from '../../src/features/orgs/types'

vi.mock('../../src/features/inventory/LocationMap', () => ({
  default: ({ onChange }: { onChange: (v: LatLng) => void }) => <button type="button" onClick={() => onChange({ lat: 21.55, lng: 39.18 })}>ضع الدبوس</button>,
}))
vi.mock('../../src/features/geo/reverseGeocode', () => ({ defaultGeocoder: async () => ({ city: 'جدة', district: 'الروضة' }) }))

const CHAIRS = SEED_ITEMS[0]
const wh = (id: string, lat: number, lng: number, district = 'حي'): Warehouse => ({ id, name: `مستودع ${id}`, city: 'جدة', district, location: { lat, lng }, createdAt: new Date(), updatedAt: new Date() })
const row = (orgId: string, orgName: string, w: Warehouse, qty: number): StockRow => ({
  id: `${w.id}__${CHAIRS.key}__new`, orgId, orgName, orgRole: 'charity', warehouseId: w.id, warehouseName: w.name, city: 'جدة',
  itemId: CHAIRS.key, itemName: CHAIRS.name, condition: 'new', qty, reserved: 0, updatedAt: new Date(),
})
const ORGS: Record<string, Org> = {
  h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved', city: 'جدة' } as Org,
  c1: { role: 'charity', name: 'جمعية البر بجدة', status: 'approved', city: 'جدة', canDeliver: true, workingHours: 'يوميًا' } as Org,
  c6: { role: 'charity', name: 'جمعية الشمال', status: 'approved', city: 'جدة', canDeliver: false, workingHours: 'الأحد – الخميس' } as Org,
}
const W1 = wh('w1', 21.572, 39.17), W6 = wh('w6', 21.596, 39.155)

function renderAt(path = '/app/requests/new', seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({
    users: ['h1', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), orgs: ORGS, signedIn: 'h1',
    warehouses: { h1: [wh('hw', 21.5433, 39.1728, 'الشرفية')], c1: [W1], c6: [W6] },
    stock: [row('c1', 'جمعية البر بجدة', W1, 50), row('c6', 'جمعية الشمال', W6, 60)], ...seed,
  })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}

async function fill(user: ReturnType<typeof userEvent.setup>, qty = '40') {
  await user.type(await screen.findByRole('combobox', { name: 'المنتج' }), 'كراسي')
  await user.click(screen.getByRole('option', { name: 'كراسي متحركة' }))
  await user.type(screen.getByRole('textbox', { name: 'الكمية' }), qty)
  await user.type(screen.getByRole('textbox', { name: 'عدد المستفيدين' }), '40')
  await user.click(screen.getByRole('radio', { name: 'عاجلة' }))
  await user.click(screen.getByRole('button', { name: 'آخر موعد تحتاجه فيه' }))
  const days = within(screen.getByRole('dialog', { name: 'اختر التاريخ' })).getAllByRole('button').filter(b => /\d{4}/.test(b.getAttribute('aria-label') ?? '') && !(b as HTMLButtonElement).disabled)
  await user.click(days[1])
  await user.type(screen.getByRole('textbox', { name: 'اسم المستلم' }), 'أحمد الغامدي')
  await user.type(screen.getByRole('textbox', { name: 'جوال المستلم' }), '0551234567')
}
const show = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'اعرض الجمعيات المناسبة' }))

describe('new request', () => {
  it('charity is sent away from the request form', async () => {
    const s = createFakeServices({ users: [{ uid: 'c1', email: 'c@t.sa', password: 'x' }], orgs: ORGS, signedIn: 'c1' })
    render(<ServicesProvider services={s}><MemoryRouter initialEntries={['/app/requests/new']}><App /></MemoryRouter></ServicesProvider>)
    expect(await screen.findByRole('heading', { name: 'الطلبات الواردة' })).toBeInTheDocument()
  })

  it('prefills the place from the hospital warehouse', async () => {
    renderAt()
    expect(await screen.findByDisplayValue('الشرفية')).toHaveAccessibleName('الحي')
  })

  it('shows validation messages', async () => {
    const { user } = renderAt()
    await screen.findByDisplayValue('الشرفية')
    await show(user)
    for (const m of ['اختر المنتج', 'اكتب الكمية بالأرقام من 1 إلى 99999', 'اكتب عدد المستفيدين بالأرقام', 'اختر تاريخ من اليوم لين سنة قدام', 'اكتب اسم المستلم', 'رقم الجوال لازم يبدأ بـ 05 ويكون 10 أرقام'])
      expect(screen.getByText(m)).toBeInTheDocument()
  })

  it('ranks charities and sends to the chosen one', async () => {
    const { s, user } = renderAt()
    await screen.findByDisplayValue('الشرفية')
    await fill(user)
    await show(user)
    const list = await screen.findByRole('list', { name: 'الجمعيات المناسبة' })
    expect(within(list).getAllByRole('heading').map(h => h.textContent)).toEqual(['جمعية الشمال', 'جمعية البر بجدة'])
    expect(within(list).getByText('90')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'اختر جمعية البر بجدة' }))
    await user.click(screen.getByRole('button', { name: 'أرسل الطلب لـجمعية البر بجدة' }))
    expect(await screen.findByRole('heading', { name: 'وصل طلبك لـجمعية البر بجدة' })).toBeInTheDocument()
    expect(screen.getByText('رمز الاستلام يظهر لك بعد موافقة الجمعية')).toBeInTheDocument()
    expect(screen.queryByLabelText('رمز الاستلام')).not.toBeInTheDocument()
    const [r] = [...s._state.requests.values()]
    expect(r).toMatchObject({ status: 1, charityId: 'c1', warehouseId: 'w1', qty: 40, priority: 'urgent', open: false, delivery: { district: 'الشرفية' } })
    expect([...s._state.contacts.values()][0]).toEqual({ hospitalId: 'h1', name: 'أحمد الغامدي', phone: '0551234567' })
  })

  it('no suitable charity offers an open request', async () => {
    const { s, user } = renderAt()
    await screen.findByDisplayValue('الشرفية')
    await fill(user, '500')
    await show(user)
    expect(await screen.findByText('ما فيه جمعية عندها الكمية للحين')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'انشره كطلب مفتوح' }))
    expect(await screen.findByRole('heading', { name: 'انتشر طلبك كطلب مفتوح' })).toBeInTheDocument()
    expect([...s._state.requests.values()][0].status).toBe(0)
  })

  it('request another product keeps receiver and place', async () => {
    const { user } = renderAt()
    await screen.findByDisplayValue('الشرفية')
    await fill(user)
    await show(user)
    await user.click(await screen.findByRole('button', { name: 'اختر جمعية الشمال' }))
    await user.click(screen.getByRole('button', { name: 'أرسل الطلب لـجمعية الشمال' }))
    await user.click(await screen.findByRole('button', { name: 'اطلب منتج ثاني' }))
    expect(screen.getByRole('textbox', { name: 'اسم المستلم' })).toHaveValue('أحمد الغامدي')
    expect(screen.getByRole('textbox', { name: 'جوال المستلم' })).toHaveValue('0551234567')
    expect(screen.getByRole('textbox', { name: 'الحي' })).toHaveValue('الشرفية')
    expect(screen.getByRole('combobox', { name: 'المنتج' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'الكمية' })).toHaveValue('')
  })

  it('without a warehouse or a pin, typed coordinates set the place', async () => {
    const { user } = renderAt('/app/requests/new', { warehouses: { c1: [W1], c6: [W6] } })
    await fill(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'المدينة' }), 'جدة')
    await user.type(screen.getByRole('textbox', { name: 'الحي' }), 'الشرفية')
    await user.type(screen.getByRole('textbox', { name: 'خط العرض' }), '21.5433')
    await user.type(screen.getByRole('textbox', { name: 'خط الطول' }), '39.1728')
    await show(user)
    expect(await screen.findByRole('list', { name: 'الجمعيات المناسبة' })).toBeInTheDocument()
  })

  it('number fields keep digits only and the phone stops at 10 digits', async () => {
    const { user } = renderAt()
    await user.type(await screen.findByRole('textbox', { name: 'الكمية' }), 'ab١٢.5')
    expect(screen.getByRole('textbox', { name: 'الكمية' })).toHaveValue('125')
    await user.type(screen.getByRole('textbox', { name: 'عدد المستفيدين' }), 'x40')
    expect(screen.getByRole('textbox', { name: 'عدد المستفيدين' })).toHaveValue('40')
    await user.type(screen.getByRole('textbox', { name: 'جوال المستلم' }), '+٠٥٥١٢٣٤٥٦٧٨٩')
    expect(screen.getByRole('textbox', { name: 'جوال المستلم' })).toHaveValue('0551234567')
  })

  it('the deadline is picked from a calendar, never typed', async () => {
    renderAt()
    expect(await screen.findByRole('button', { name: 'آخر موعد تحتاجه فيه' })).toHaveTextContent('اختر التاريخ')
    expect(screen.queryByRole('textbox', { name: 'آخر موعد تحتاجه فيه' })).not.toBeInTheDocument()
  })

  it('focus moves to the first problem, then to each new step', async () => {
    const { user } = renderAt()
    await screen.findByDisplayValue('الشرفية')
    await show(user)
    expect(screen.getByRole('combobox', { name: 'المنتج' })).toHaveFocus()
    await fill(user)
    await show(user)
    expect(await screen.findByRole('heading', { name: 'الجمعيات المناسبة', level: 1 })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'اختر جمعية الشمال' }))
    await user.click(screen.getByRole('button', { name: 'أرسل الطلب لـجمعية الشمال' }))
    expect(await screen.findByRole('heading', { name: 'تم إرسال الطلب', level: 1 })).toHaveFocus()
  })

  it('moving the pin fills the district from the map', async () => {
    const { user } = renderAt()
    await screen.findByDisplayValue('الشرفية')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'ضع الدبوس' })) })
    expect(await screen.findByDisplayValue('الروضة')).toHaveAccessibleName('الحي')
  })

  it('loading or sending failures show a message', async () => {
    const failing = renderAt('/app/requests/new', { failures: { requests: true } })
    await screen.findByDisplayValue('الشرفية')
    await fill(failing.user)
    await show(failing.user)
    expect(await screen.findByText('تعذّر تحميل الجمعيات، حاول مرة ثانية')).toBeInTheDocument()
  })

  it('a failed send keeps the choice and shows a message', async () => {
    const { s, user } = renderAt()
    vi.spyOn(s.requests, 'send').mockRejectedValue(new Error('offline'))
    await screen.findByDisplayValue('الشرفية')
    await fill(user)
    await show(user)
    await user.click(await screen.findByRole('button', { name: 'اختر جمعية الشمال' }))
    await user.click(screen.getByRole('button', { name: 'أرسل الطلب لـجمعية الشمال' }))
    expect(await screen.findByText('ما قدرنا نرسل الطلب، حاول مرة ثانية')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'أرسل الطلب لـجمعية الشمال' })).toBeInTheDocument()
  })
})
