import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import type { HospitalRequest } from '../../src/features/requests/types'
import type { Org } from '../../src/features/orgs/types'

const req = (over: Partial<HospitalRequest> = {}): HospitalRequest => ({
  id: 'r1', hospitalId: 'h1', hospitalName: 'مستشفى الملك فهد', itemId: 'k', itemName: 'كراسي متحركة', qty: 40, accept: 'any', priority: 'urgent', beneficiaries: 40,
  neededBy: new Date(2026, 11, 1), delivery: { lat: 21.54, lng: 39.17, city: 'جدة', district: 'الشرفية', details: '' },
  status: 3, mode: 'delivery', open: false, excluded: [], charityId: 'c1', charityName: 'جمعية البر', warehouseId: 'wa',
  createdAt: new Date(2026, 10, 25, 10), sentAt: new Date(2026, 10, 25, 10), acceptedAt: new Date(2026, 10, 25, 11), preparingAt: new Date(2026, 10, 26, 8), updatedAt: new Date(), ...over,
})
function renderAt(path: string, signedIn: 'h1' | 'c1', over: Partial<HospitalRequest> = {}) {
  const s = createFakeServices({
    users: ['h1', 'c1'].map(uid => ({ uid, email: `${uid}@t.sa`, password: 'x' })), signedIn,
    orgs: { h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org, c1: { role: 'charity', name: 'جمعية البر', status: 'approved', canDeliver: true } as Org },
    requests: [req(over)], codes: { r1: '4827' },
  })
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
}
const NOTE = { text: 'تواصلنا مع الجمعية والتوصيل بكرة', at: new Date(2026, 10, 26, 13, 40) }

describe('admin note and return on the organisations’ pages', () => {
  it('the hospital sees the admin note with its date', async () => {
    renderAt('/app/requests/r1', 'h1', { adminNote: NOTE })
    expect(await screen.findByRole('heading', { name: 'ملاحظة من إدارة وصال' })).toBeInTheDocument()
    expect(screen.getByText(NOTE.text)).toBeInTheDocument()
    expect(screen.getByText(/26 نوفمبر · 1:40 م/, { selector: 'p, span, time' })).toBeInTheDocument()
  })

  it('the charity sees the admin note too', async () => {
    renderAt('/app/incoming/r1', 'c1', { adminNote: NOTE })
    expect(await screen.findByRole('heading', { name: 'ملاحظة من إدارة وصال' })).toBeInTheDocument()
    expect(screen.getByText(NOTE.text)).toBeInTheDocument()
  })

  it('no note, no card', async () => {
    renderAt('/app/requests/r1', 'h1')
    await screen.findByRole('heading', { name: 'سجل الطلب' })
    expect(screen.queryByRole('heading', { name: 'ملاحظة من إدارة وصال' })).not.toBeInTheDocument()
  })

  it('a request the admin sent back tells the hospital why and offers the next step', async () => {
    renderAt('/app/requests/r1', 'h1', {
      status: 0, open: false, charityId: undefined, charityName: undefined, warehouseId: undefined, preparingAt: undefined, acceptedAt: undefined,
      adminReturn: { charityName: 'جمعية البر', reason: 'الجمعية ما ردت', at: new Date(2026, 10, 26, 9) },
    })
    expect(await screen.findByRole('heading', { name: 'أرجعت إدارة وصال الطلب من جمعية البر' })).toBeInTheDocument()
    expect(screen.getByText('السبب: الجمعية ما ردت')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'اختر جمعية ثانية' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'انشره كطلب مفتوح' })).toBeInTheDocument()
  })
})
