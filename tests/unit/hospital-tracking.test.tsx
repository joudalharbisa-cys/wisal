import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const req = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: 'k', itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 11, 1), delivery: { lat: 21.5433, lng: 39.1728, city: 'جدة', district: 'الشرفية', details: '' },
  status: 2, open: false, excluded: [], charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa', reservation: {},
  createdAt: new Date(2026, 10, 25, 10), sentAt: new Date(2026, 10, 25, 10), acceptedAt: new Date(2026, 10, 25, 11, 2), updatedAt: new Date(), ...over,
})
function renderAt(over: Partial<HospitalRequest> = {}, path = '/app/requests/r1') {
  const s = createFakeServices({
    users: ['h1', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn: 'h1',
    orgs: { h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org, c1: { role: 'charity', name: 'جمعية البر', status: 'approved' } as Org },
    warehouses: { c1: [{ id: 'wa', name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.572, lng: 39.17 }, createdAt: new Date(), updatedAt: new Date() }] },
    requests: [req(over)], codes: { r1: '4827' }, contacts: { r1: { hospitalId: 'h1', name: 'أحمد الغامدي', phone: '0551234567' } },
  })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}
const DRIVER = { name: 'فهد العتيبي', phone: '0551112222', eta: new Date(2026, 10, 26, 14, 30) }

describe('hospital tracking', () => {
  it('shows the dated timeline and the driver while out for delivery', async () => {
    renderAt({ status: 4, mode: 'delivery', preparingAt: new Date(2026, 10, 26, 8, 15), outAt: new Date(2026, 10, 26, 13, 40), driver: DRIVER })
    const tl = await screen.findByRole('list', { name: 'مراحل الطلب' })
    expect(within(tl).getByText('تمت الموافقة').parentElement).toHaveTextContent('25 نوفمبر · 11:02 ص')
    expect(within(tl).getByText('طلع للتوصيل').parentElement).toHaveTextContent('26 نوفمبر · 1:40 م')
    expect(screen.getByText(/السائق: فهد العتيبي · 0551112222/, { selector: 'p' })).toHaveTextContent('2:30 م')
    expect(screen.getByText('قيد التوصيل', { selector: '[data-testid="status-badge"]' })).toBeInTheDocument()
    expect(await screen.findByText('4827')).toHaveAttribute('aria-label', 'رمز الاستلام')
  })

  it('pickup: the hospital enters its courier', async () => {
    const { s, user } = renderAt({ status: 3, mode: 'pickup', preparingAt: new Date() })
    await user.click(await screen.findByRole('button', { name: 'حفظ بيانات المندوب' }))
    expect(screen.getByText('اكتب اسم المندوب')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'اسم المندوب' }), 'سعد القحطاني')
    await user.type(screen.getByRole('textbox', { name: 'جوال المندوب' }), '0553334444')
    await user.click(screen.getByRole('button', { name: 'حفظ بيانات المندوب' }))
    expect(await screen.findByText(/مندوب المستشفى: سعد القحطاني/, { selector: 'p' })).toBeInTheDocument()
    expect(s._state.requests.get('r1')?.pickup).toMatchObject({ name: 'سعد القحطاني', phone: '0553334444' })
    await user.click(screen.getByRole('button', { name: 'غيّر بيانات المندوب' }))
    expect(screen.getByRole('textbox', { name: 'اسم المندوب' })).toHaveValue('سعد القحطاني')
  })

  it('pickup tells the hospital where to send its courier and to hand it the code', async () => {
    renderAt({ status: 4, mode: 'pickup', preparingAt: new Date(), outAt: new Date() })
    expect(await screen.findByText(/المستودع الرئيسي · جدة، النعيم/)).toBeInTheDocument()
    expect(await screen.findByText('اعطِ الرمز لمندوبك قبل ما يروح، والجمعية تكتبه لما يستلم.')).toBeInTheDocument()
  })

  it('one centred column: the code card sits last, under the details', async () => {
    renderAt({ status: 4, mode: 'delivery', preparingAt: new Date(), outAt: new Date(), driver: DRIVER })
    await screen.findByText('4827')
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings.at(-1)).toBe('رمز الاستلام')
    expect(headings.indexOf('حالة الطلب')).toBe(0)
  })

  it('no courier form for delivery requests', async () => {
    renderAt({ status: 3, mode: 'delivery', preparingAt: new Date() })
    await screen.findByRole('list', { name: 'مراحل الطلب' })
    expect(screen.queryByRole('button', { name: 'حفظ بيانات المندوب' })).not.toBeInTheDocument()
  })

  it('locked code entry can be reopened by the hospital', async () => {
    const { s, user } = renderAt({ status: 5, mode: 'delivery', codeFails: 5, arrivedAt: new Date() })
    expect(await screen.findByRole('heading', { name: 'انقفل إدخال الرمز' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'افتح إدخال الرمز' }))
    expect(s._state.requests.get('r1')?.codeFails).toBe(0)
    expect(screen.queryByRole('heading', { name: 'انقفل إدخال الرمز' })).not.toBeInTheDocument()
  })

  it('a meeting proposed by the hospital names it', async () => {
    const { user } = renderAt()
    await user.click(await screen.findByRole('button', { name: 'اقترح اجتماع' }))
    await user.type(screen.getByRole('textbox', { name: 'رابط الاجتماع' }), 'https://zoom.us/j/123456')
    await user.click(screen.getByRole('button', { name: 'احفظ' }))
    expect(await screen.findByText(/اقترحته مستشفى الملك فهد/)).toBeInTheDocument()
  })

  it('after the code check the hospital just sees «وصل», never «تم التحقق»', async () => {
    renderAt({ status: 6, mode: 'delivery', preparingAt: new Date(), outAt: new Date(), arrivedAt: new Date(2026, 10, 26, 14, 34), verifiedAt: new Date(2026, 10, 26, 14, 40) })
    expect(await screen.findByText('وصل', { selector: '[data-testid="status-badge"]' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/تحقق/)
    expect(screen.queryByRole('button', { name: 'اقترح اجتماع' })).not.toBeInTheDocument()
  })

  it('the list shows «وصل» and a 6-step bar for a verified request', async () => {
    renderAt({ status: 6, mode: 'delivery', arrivedAt: new Date(2026, 10, 26, 14, 34), verifiedAt: new Date(2026, 10, 26, 14, 40) }, '/app')
    const row = within(await screen.findByRole('list', { name: 'طلباتي' })).getByRole('listitem')
    expect(row).toHaveTextContent('وصل')
    expect(row).toHaveTextContent('26 نوفمبر · 2:34 م')
    expect(row.textContent).not.toMatch(/تحقق/)
    expect(row.querySelectorAll('[class~="h-1.5"]')).toHaveLength(6)
  })
})
