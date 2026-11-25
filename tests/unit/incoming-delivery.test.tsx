import { render, screen, within } from '@testing-library/react'
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
const NEW = `wa__${CH.key}__new`
const W: Warehouse = { id: 'wa', name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.572, lng: 39.17 }, createdAt: new Date(), updatedAt: new Date() }
const ROW: StockRow = { id: NEW, orgId: 'c1', orgName: 'جمعية البر', orgRole: 'charity', warehouseId: 'wa', warehouseName: W.name, city: 'جدة', itemId: CH.key, itemName: CH.name, condition: 'new', qty: 50, reserved: 40, updatedAt: new Date() }
const req = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: CH.key, itemName: CH.name, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 11, 1), delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: '' },
  status: 2, open: false, excluded: [], charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', reservation: { [NEW]: 40 },
  createdAt: new Date(2026, 10, 25, 10), sentAt: new Date(2026, 10, 25, 10), acceptedAt: new Date(2026, 10, 25, 11), updatedAt: new Date(), ...over,
})

function renderAt(over: Partial<HospitalRequest> = {}, canDeliver = true) {
  const s = createFakeServices({
    users: ['h1', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn: 'c1',
    orgs: { h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org, c1: { role: 'charity', name: 'جمعية البر', status: 'approved', canDeliver } as Org },
    warehouses: { c1: [W] }, stock: [ROW], requests: [req(over)], codes: { r1: '4827' },
    contacts: { r1: { hospitalId: 'h1', name: 'أحمد الغامدي', phone: '0551234567' } },
  })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={['/app/incoming/r1']}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}
const badge = () => screen.getByTestId('status-badge')
const timeline = () => screen.getByRole('list', { name: 'مراحل الطلب' })

describe('charity delivery actions', () => {
  it('delivery journey: prepare → driver → arrived → wrong code → right code closes and deducts', async () => {
    const { s, user } = renderAt()
    expect(await within(await screen.findByRole('list', { name: 'مراحل الطلب' })).findByText('قبلت الطلب')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'بدأنا التجهيز' }))
    expect(await screen.findByRole('heading', { name: 'بيانات التوصيل' })).toBeInTheDocument()
    expect(badge()).toHaveTextContent('تجهيز الطلب')

    await user.click(screen.getByRole('button', { name: 'طلع للتوصيل' }))
    expect(screen.getByText('اكتب اسم السائق')).toBeInTheDocument()
    expect(screen.getByText('رقم الجوال لازم يبدأ بـ 05 ويكون 10 أرقام')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'اسم السائق' }), 'فهد العتيبي')
    await user.type(screen.getByRole('textbox', { name: 'جوال السائق' }), 'ab٠٥٥١١١٢٢٢٢')
    expect(screen.getByRole('textbox', { name: 'جوال السائق' })).toHaveValue('0551112222')
    await user.selectOptions(screen.getByRole('combobox', { name: 'الساعة' }), '14:30')
    await user.click(screen.getByRole('button', { name: 'طلع للتوصيل' }))
    expect(await screen.findByText('قيد التوصيل', { selector: '[data-testid="status-badge"]' })).toBeInTheDocument()
    expect(within(timeline()).getByText(/السائق: فهد العتيبي · 0551112222/)).toHaveTextContent('2:30 م')

    await user.click(screen.getByRole('button', { name: 'وصل' }))
    const code = await screen.findByRole('textbox', { name: 'رمز الاستلام' })
    await user.type(code, '1111')
    await user.click(screen.getByRole('button', { name: 'تحقق' }))
    expect(await screen.findByText('الرمز غلط، باقي 4 محاولات')).toBeInTheDocument()
    await user.clear(code)
    await user.type(code, '٤٨٢٧')
    await user.click(screen.getByRole('button', { name: 'تحقق' }))
    expect(await screen.findByText('تم التحقق — الطلب مكتمل')).toBeInTheDocument()
    expect(s._state.stock.get(`c1/${NEW}`)).toMatchObject({ qty: 10, reserved: 0 })
  })

  it('pickup: ready for collection, then the hospital courier arrives', async () => {
    const { s, user } = renderAt({}, false)
    await user.click(await screen.findByRole('button', { name: 'بدأنا التجهيز' }))
    await user.click(await screen.findByRole('button', { name: 'جاهز للاستلام' }))
    expect(await screen.findByText('بانتظار بيانات مندوب المستشفى')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'وصل مندوب المستشفى' }))
    expect(await screen.findByRole('textbox', { name: 'رمز الاستلام' })).toBeInTheDocument()
    expect(s._state.requests.get('r1')).toMatchObject({ status: 5, mode: 'pickup' })
  })

  it('shows the hospital courier once entered', async () => {
    renderAt({ status: 4, mode: 'pickup', preparingAt: new Date(), outAt: new Date(), pickup: { name: 'سعد القحطاني', phone: '0553334444', eta: new Date(2026, 10, 26, 9) } })
    expect(await screen.findByText(/مندوب المستشفى: سعد القحطاني/, { selector: 'p' })).toBeInTheDocument()
  })

  it('locked after five wrong codes', async () => {
    renderAt({ status: 5, mode: 'delivery', codeFails: 5 })
    expect(await screen.findByText('انقفل إدخال الرمز، تواصل مع المستشفى')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'رمز الاستلام' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'تحقق' })).toBeDisabled()
  })

  it('a network error does not claim the code was wrong', async () => {
    const { s, user } = renderAt({ status: 5, mode: 'delivery' })
    vi.spyOn(s.requests, 'submitCode').mockRejectedValue(new ServiceError('network'))
    await user.type(await screen.findByRole('textbox', { name: 'رمز الاستلام' }), '4827')
    await user.click(screen.getByRole('button', { name: 'تحقق' }))
    expect(await screen.findByText('تعذّر الاتصال، حاول مرة ثانية')).toBeInTheDocument()
    expect(screen.queryByText(/الرمز غلط/)).not.toBeInTheDocument()
  })

  it('proposes, shows and removes a meeting', async () => {
    const { s, user } = renderAt()
    await user.click(await screen.findByRole('button', { name: 'اقترح اجتماع' }))
    const dialog = screen.getByRole('dialog', { name: 'اقترح اجتماع' })
    await user.type(within(dialog).getByRole('textbox', { name: 'رابط الاجتماع' }), 'http://meet.example.com/x')
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }))
    expect(within(dialog).getByText('الرابط لازم يبدأ بـ https://')).toBeInTheDocument()
    await user.clear(within(dialog).getByRole('textbox', { name: 'رابط الاجتماع' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'رابط الاجتماع' }), 'https://meet.google.com/abc-defg-hij')
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }))
    expect(await screen.findByText(/اقترحته جمعية البر/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'افتح الرابط' })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij')
    expect(s._state.requests.get('r1')?.meeting).toMatchObject({ byRole: 'charity' })
    await user.click(screen.getByRole('button', { name: 'احذف الاجتماع' }))
    expect(await screen.findByRole('button', { name: 'اقترح اجتماع' })).toBeInTheDocument()
    expect(s._state.requests.get('r1')?.meeting).toBeUndefined()
  })

  it('a finished request has no meeting button', async () => {
    renderAt({ status: 6, mode: 'delivery', verifiedAt: new Date() })
    expect(await screen.findByText('تم التحقق — الطلب مكتمل')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'اقترح اجتماع' })).not.toBeInTheDocument()
  })
})
