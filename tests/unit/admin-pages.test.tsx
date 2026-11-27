import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { OrgRef, StockRow, Warehouse } from '../../src/features/inventory/types'
import type { HospitalRequest, ValidRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const CH = SEED_ITEMS[0]
const H: OrgRef = { uid: 'h1', name: 'مستشفى الملك فهد', role: 'hospital' }
const C1: OrgRef = { uid: 'c1', name: 'جمعية البر', role: 'charity' }
const C2: OrgRef = { uid: 'c2', name: 'جمعية الشمال', role: 'charity' }
const wh = (id: string, name: string): Warehouse => ({ id, name, city: 'جدة', district: 'النعيم', location: { lat: 21.6, lng: 39.15 }, createdAt: new Date(), updatedAt: new Date() })
const row = (org: OrgRef, w: string, qty: number, reserved = 0): StockRow => ({
  id: `${w}__${CH.key}__new`, orgId: org.uid, orgName: org.name, orgRole: 'charity', warehouseId: w, warehouseName: 'المستودع الرئيسي', city: 'جدة',
  itemId: CH.key, itemName: CH.name, condition: 'new', qty, reserved, updatedAt: new Date(),
})
const REQ: ValidRequest = {
  item: { kind: 'existing', item: CH }, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40, neededBy: new Date(2030, 0, 1),
  receiver: { name: 'أحمد الغامدي', phone: '0551234567' }, delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: 'البوابة 3' },
}
const ORGS: Record<string, Org> = {
  h1: { role: 'hospital', name: H.name, status: 'approved', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-1', hospitalType: 'gov', contactEmail: 'h1@t.sa', contract: { version: '1.0', acceptedAt: new Date(), acceptedByName: 'موقّع' }, createdAt: new Date(2026, 10, 20), updatedAt: new Date(), reviewedBy: 'a1', reviewedAt: new Date(2026, 10, 21) } as Org,
  c1: { role: 'charity', name: C1.name, status: 'approved', city: 'جدة', district: 'النعيم', licenseNo: '4521', workingHours: 'الأحد', canDeliver: true, contactEmail: 'c1@t.sa', contract: { version: '1.0', acceptedAt: new Date(), acceptedByName: 'موقّع' }, createdAt: new Date(2026, 10, 20), updatedAt: new Date(), reviewedBy: 'a1', reviewedAt: new Date(2026, 10, 21, 9, 2) } as Org,
  c2: { role: 'charity', name: C2.name, status: 'approved', city: 'جدة', district: 'الروضة', licenseNo: '4522', workingHours: 'الأحد', canDeliver: false, contactEmail: 'c2@t.sa', contract: { version: '1.0', acceptedAt: new Date(), acceptedByName: 'موقّع' }, createdAt: new Date(2026, 10, 20), updatedAt: new Date(), reviewedBy: 'a9', reviewedAt: new Date() } as Org,
  c9: { role: 'charity', name: 'جمعية الإحسان', status: 'pending', city: 'مكة المكرمة', district: 'العزيزية', licenseNo: '9', workingHours: 'الأحد', canDeliver: false, contactEmail: 'c9@t.sa', contract: { version: '1.0', acceptedAt: new Date(), acceptedByName: 'موقّع' }, createdAt: new Date(2026, 10, 26), updatedAt: new Date() } as Org,
}
const as = async (s: ReturnType<typeof make>, uid: string) => { await s.auth.signOut(); await s.auth.signIn(`${uid}@t.sa`, 'x') }
function make(extra: HospitalRequest[] = []) {
  return createFakeServices({
    users: ['h1', 'c1', 'c2', 'a1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn: 'h1', admins: ['a1'], orgs: ORGS,
    warehouses: { c1: [wh('wa', 'المستودع الرئيسي')], c2: [wh('wb', 'مستودع الروضة')] }, stock: [row(C1, 'wa', 50), row(C2, 'wb', 60)], requests: extra,
  })
}
/** One request rejected by الشمال then re-sent to البر (waiting), one open, all through the services so the log exists. */
async function journey() {
  const s = make([{
    id: 'old', hospitalId: 'h1', hospitalName: H.name, itemId: CH.key, itemName: 'أسرّة طبية', qty: 5, accept: 'any', priority: 'medium', beneficiaries: 5,
    neededBy: new Date(2026, 0, 1), delivery: REQ.delivery, status: 4, mode: 'delivery', open: false, excluded: [], charityId: 'c2', charityName: C2.name, warehouseId: 'wb',
    createdAt: new Date(2025, 11, 1), updatedAt: new Date(2025, 11, 2), acceptedAt: new Date(2025, 11, 1, 12), preparingAt: new Date(2025, 11, 2), outAt: new Date(2025, 11, 2, 10),
  }])
  const { id } = await s.requests.send(H, REQ, { charityId: 'c2', charityName: C2.name, warehouseId: 'wb' })
  await as(s, 'c2'); await s.requests.reject(C2, id, 'مشغولين')
  await as(s, 'h1'); await s.requests.chooseAgain(H, id, { charityId: 'c1', charityName: C1.name, warehouseId: 'wa' })
  await s.requests.send(H, { ...REQ, qty: 500 }, null)
  await as(s, 'a1')
  return { s, id }
}
function show(s: ReturnType<typeof make>, path: string) {
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return userEvent.setup()
}

describe('admin oversight pages', () => {
  it('the admin nav leads to the four areas; applications keep their page', async () => {
    const { s } = await journey()
    show(s, '/admin/applications')
    expect(await screen.findByRole('heading', { name: 'طلبات التسجيل', level: 1 })).toBeInTheDocument()
    for (const l of ['نظرة عامة', 'الجهات', 'الطلبات']) expect(screen.getByRole('link', { name: l })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /طلبات التسجيل\s*1/ })).toHaveAttribute('href', '/admin/applications')
  })

  it('overview: numbers, stages, attention and the latest activity', async () => {
    const { s } = await journey()
    show(s, '/admin')
    expect(await screen.findByRole('heading', { name: 'نظرة عامة', level: 1 })).toBeInTheDocument()
    expect((await screen.findByText('كل الطلبات')).nextSibling).toHaveTextContent('3')
    expect(screen.getByText('جمعيات معتمدة').nextSibling).toHaveTextContent('2')
    expect(screen.getByRole('link', { name: /بانتظار موافقة الجمعية\s*1|1\s*بانتظار موافقة الجمعية/ })).toHaveAttribute('href', '/admin/requests?stage=waitingCharity')
    const attention = screen.getByRole('region', { name: 'تحتاج انتباه' })
    expect(within(attention).getByRole('link', { name: /طلب واحد عدى آخر موعده/ })).toHaveAttribute('href', '/admin/requests?attention=late')
    expect(within(attention).getByRole('link', { name: /طلب مفتوح ما عند أي جمعية كميته/ })).toHaveAttribute('href', '/admin/requests?attention=uncovered')
    const feed = screen.getByRole('region', { name: 'آخر النشاط' })
    expect(within(feed).getByText('رفضت جمعية الشمال الطلب')).toBeInTheDocument()
  })

  it('organisations: filter by role and search', async () => {
    const { s } = await journey()
    const user = show(s, '/admin/orgs')
    const list = await screen.findByRole('list', { name: 'الجهات' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: /^جمعيات/ }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    await user.type(screen.getByRole('searchbox', { name: 'ابحث بالاسم' }), 'الإحسان')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('بانتظار المراجعة')).toBeInTheDocument()
  })

  it('an organisation: profile, reviewer, stock with reserved and available, its requests and the ones it rejected', async () => {
    const { s } = await journey()
    show(s, '/admin/orgs/c2')
    expect(await screen.findByRole('heading', { name: 'جمعية الشمال', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/أدمن ثاني/)).toBeInTheDocument()
    const stock = await screen.findByRole('table', { name: 'مستودع الروضة' })
    expect(within(stock).getByRole('row', { name: /كراسي متحركة/ })).toHaveTextContent(/60\s*0\s*60/)
    expect(screen.getByRole('region', { name: 'رفضتها' })).toHaveTextContent('كراسي متحركة · 40')
    expect(screen.getByRole('region', { name: 'طلباتها' })).toHaveTextContent('أسرّة طبية · 5')
  })

  it('requests: filtered by stage from the URL, with attention markers', async () => {
    const { s } = await journey()
    show(s, '/admin/requests?stage=waitingCharity')
    const list = await screen.findByRole('list', { name: 'الطلبات' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('listitem')).toHaveTextContent('مستشفى الملك فهد ← جمعية البر')
  })

  it('a request: full log with every rejection, receiver, and the admin actions', async () => {
    const { s, id } = await journey()
    const user = show(s, `/admin/requests/${id}`)
    const log = await screen.findByRole('list', { name: 'سجل الطلب' })
    expect(within(log).getByText('رفضت جمعية الشمال الطلب')).toBeInTheDocument()
    expect(within(log).getByText('السبب: مشغولين')).toBeInTheDocument()
    expect(within(log).getAllByText(/^أُرسل ل/)).toHaveLength(2)
    expect(await screen.findByText('أحمد الغامدي')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'أرجع الطلب للمستشفى' }))
    const dialog = screen.getByRole('dialog', { name: 'أرجع الطلب للمستشفى' })
    await user.type(within(dialog).getByRole('textbox', { name: 'السبب' }), 'الجمعية ما ردت')
    await user.click(within(dialog).getByRole('button', { name: 'أرجعه' }))
    expect(await within(log).findByText('أرجعت إدارة وصال الطلب من جمعية البر')).toBeInTheDocument()
    expect(s._state.requests.get(id)).toMatchObject({ status: 0, adminReturn: { reason: 'الجمعية ما ردت' } })

    await user.type(screen.getByRole('textbox', { name: 'ملاحظة للمستشفى والجمعية' }), 'بنتابع معكم')
    await user.click(screen.getByRole('button', { name: 'احفظ الملاحظة' }))
    expect(await within(log).findByText('ملاحظة من إدارة وصال')).toBeInTheDocument()
    expect(s._state.requests.get(id)?.adminNote?.text).toBe('بنتابع معكم')
    await user.click(screen.getByRole('button', { name: 'احذف الملاحظة' }))
    expect(s._state.requests.get(id)?.adminNote).toBeUndefined()
  })

  it('reset code attempts shows only at arrival with attempts, and a request without a log says so', async () => {
    const s = make([{
      id: 'r5', hospitalId: 'h1', hospitalName: H.name, itemId: CH.key, itemName: CH.name, qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
      neededBy: new Date(2030, 0, 1), delivery: REQ.delivery, status: 5, mode: 'delivery', open: false, excluded: [], charityId: 'c1', charityName: C1.name, warehouseId: 'wa',
      codeFails: 5, createdAt: new Date(2026, 10, 25), updatedAt: new Date(), acceptedAt: new Date(2026, 10, 25, 11), arrivedAt: new Date(2026, 10, 26, 14),
    }])
    await as(s, 'a1')
    const user = show(s, '/admin/requests/r5')
    expect(await screen.findByText('محاولات الرمز: 5 من 5 — الإدخال مقفول')).toBeInTheDocument()
    expect(screen.getByText(/قبل السجل الكامل/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'صفّر محاولات الرمز' }))
    expect(s._state.requests.get('r5')?.codeFails).toBe(0)
    expect(await screen.findByText('محاولات الرمز: 0 من 5')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'صفّر محاولات الرمز' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('4827')
  })
})
