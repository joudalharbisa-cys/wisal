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
  neededBy: new Date(2026, 10, 27), open: false, excluded: [], delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' },
  status: 1, charityId: 'c1', charityName: 'جمعية الشمال', warehouseId: 'w1', createdAt: new Date(2026, 10, 25, 10), updatedAt: new Date(), ...over,
})
const REQS = [
  req('r1'),
  req('r2', { itemName: 'أجهزة تنفس', qty: 5, priority: 'normal', status: 0, open: true, charityId: undefined, charityName: undefined, warehouseId: undefined, createdAt: new Date(2026, 10, 25, 12) }),
  req('r3', { hospitalId: 'h2', hospitalName: 'مستشفى الولادة', itemName: 'أسرّة طبية' }),
]

function renderAt(path: string, seed: Partial<Parameters<typeof createFakeServices>[0]> = {}) {
  const s = createFakeServices({ users: [{ uid: 'h1', email: 'h@t.sa', password: 'x' }], orgs: ORGS, signedIn: 'h1', requests: REQS, codes: { r1: '4827', r2: '0193', r3: '5555' },
    contacts: { r1: { hospitalId: 'h1', name: 'أحمد الغامدي', phone: '0551234567' } }, ...seed })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return userEvent.setup()
}

const CHAIRS_KEY = 'k'
const cw = (id: string, lat: number) => ({ id, name: `مستودع ${id}`, city: 'جدة', district: 'حي', location: { lat, lng: 39.17 }, createdAt: new Date(), updatedAt: new Date() })
const crow = (orgId: string, orgName: string, wh: string) => ({ id: `${wh}__${CHAIRS_KEY}__new`, orgId, orgName, orgRole: 'charity' as const, warehouseId: wh, warehouseName: wh, city: 'جدة', itemId: CHAIRS_KEY, itemName: 'كراسي متحركة', condition: 'new' as const, qty: 80, reserved: 0, updatedAt: new Date() })
const REJECTED = req('r5', { status: 0, open: false, excluded: ['c6'], charityId: undefined, charityName: undefined, warehouseId: undefined,
  lastRejection: { charityName: 'جمعية الشمال', reason: 'مشغولين', at: new Date() }, createdAt: new Date(2026, 10, 25, 14) })
const withCharities = {
  orgs: { ...ORGS, c1: { role: 'charity', name: 'جمعية البر', status: 'approved', canDeliver: true, workingHours: 'يوميًا' } as Org, c6: { role: 'charity', name: 'جمعية الشمال', status: 'approved', canDeliver: false, workingHours: 'الأحد' } as Org },
  warehouses: { c1: [cw('w1', 21.572)], c6: [cw('w6', 21.596)] },
  stock: [crow('c1', 'جمعية البر', 'w1'), crow('c6', 'جمعية الشمال', 'w6')],
  requests: [...REQS, REJECTED],
}

describe('after a rejection', () => {
  it('rejected request shows the banner and lets the hospital choose again', async () => {
    const user = renderAt('/app/requests/r5', withCharities)
    expect(await screen.findByRole('heading', { name: 'رفضت جمعية الشمال الطلب' })).toBeInTheDocument()
    expect(screen.getByText(/مشغولين/, { selector: 'p' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'اختر جمعية ثانية' }))
    const list = await screen.findByRole('list', { name: 'الجمعيات المناسبة' })
    expect(within(list).getAllByRole('heading').map(h => h.textContent)).toContain('جمعية الشمال')
    expect(within(list).getByText('رفضت الطلب قبل')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'اختر جمعية البر' }))
    await user.click(screen.getByRole('button', { name: 'أرسل الطلب لـجمعية البر' }))
    expect(await screen.findByText('بانتظار موافقة الجمعية', { selector: '[data-testid="status-badge"]' })).toBeInTheDocument()
  })

  it('publishing makes it open', async () => {
    const user = renderAt('/app/requests/r5', withCharities)
    await user.click(await screen.findByRole('button', { name: 'انشره كطلب مفتوح' }))
    expect(await screen.findByText('طلب مفتوح', { selector: '[data-testid="status-badge"]' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'رفضت جمعية الشمال الطلب' })).not.toBeInTheDocument()
  })

  it('the list marks it as waiting for the hospital', async () => {
    renderAt('/app', withCharities)
    const list = await screen.findByRole('list', { name: 'طلباتي' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('بانتظار قرارك')
  })
})

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

  it('each row shows its latest step with date and time', async () => {
    renderAt('/app', { requests: [req('r7', { status: 4, mode: 'pickup', acceptedAt: new Date(2026, 10, 25, 11), preparingAt: new Date(2026, 10, 25, 12), outAt: new Date(2026, 10, 26, 13, 40) })] })
    const row = within(await screen.findByRole('list', { name: 'طلباتي' })).getByRole('listitem')
    expect(row).toHaveTextContent('جاهز للاستلام')
    expect(row).toHaveTextContent('26 نوفمبر · 1:40 م')
  })

  it('empty state offers a new request', async () => {
    const user = renderAt('/app', { requests: [] })
    expect(await screen.findByText('ما عندك طلبات للحين')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'طلب جديد' })[0])
    expect(await screen.findByRole('heading', { name: 'طلب جديد' })).toBeInTheDocument()
  })

  it('details show the receipt code once approved', async () => {
    renderAt('/app/requests/r4', { requests: [...REQS, req('r4', { status: 2 })], codes: { r4: '7310' } })
    expect(await screen.findByText('7310')).toHaveAttribute('aria-label', 'رمز الاستلام')
  })

  it('details show fields and hide the code before approval', async () => {
    renderAt('/app/requests/r1')
    expect(await screen.findByRole('heading', { name: 'كراسي متحركة · 40' })).toBeInTheDocument()
    expect(await screen.findByText('يظهر رمز الاستلام هنا بعد موافقة الجمعية')).toBeInTheDocument()
    expect(screen.queryByText('4827')).not.toBeInTheDocument()
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
