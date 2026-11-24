import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'

type Fake = ReturnType<typeof createFakeServices>

function setup(s: Fake = createFakeServices()) {
  render(
    <ServicesProvider services={s}>
      <MemoryRouter initialEntries={['/register']}><App /></MemoryRouter>
    </ServicesProvider>,
  )
  return s
}

async function chooseRole(name: 'مستشفى' | 'جمعية') {
  await userEvent.click(await screen.findByRole('radio', { name }))
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
}

async function fillHospital({ account = true, password = 'password123', confirm = 'password123', email = 'h@test.sa' } = {}) {
  await userEvent.type(screen.getByLabelText('اسم الجهة'), 'مستشفى الملك فهد')
  await userEvent.selectOptions(screen.getByLabelText('المدينة'), 'جدة')
  await userEvent.type(screen.getByLabelText('الحي'), 'الشرفية')
  await userEvent.type(screen.getByLabelText('رقم الترخيص'), 'MOH-12345')
  await userEvent.click(screen.getByRole('radio', { name: 'حكومي' }))
  if (account) {
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), email)
    await userEvent.type(screen.getByLabelText('كلمة المرور'), password)
    await userEvent.type(screen.getByLabelText('تأكيد كلمة المرور'), confirm)
  }
}

async function signContract(name = 'أحمد الغامدي') {
  await userEvent.type(screen.getByLabelText('اسم الموقّع'), name)
  await userEvent.click(screen.getByRole('checkbox', { name: 'قرأت العقد وأوافق عليه' }))
}

it('stays on details and shows the error when the name is empty', async () => {
  setup()
  await chooseRole('مستشفى')
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  expect(screen.getByText('اكتب اسم الجهة')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'بيانات الجهة' })).toBeInTheDocument()
})

it('charity sees working hours and delivery, not hospital type', async () => {
  setup()
  await chooseRole('جمعية')
  expect(screen.getByLabelText('أوقات العمل')).toBeInTheDocument()
  expect(screen.getByRole('radiogroup', { name: 'عندكم توصيل؟' })).toBeInTheDocument()
  expect(screen.queryByRole('radiogroup', { name: 'نوع المستشفى' })).not.toBeInTheDocument()
})

it('checks password length and confirmation', async () => {
  setup()
  await chooseRole('مستشفى')
  await fillHospital({ password: 'short', confirm: 'other' })
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  expect(screen.getByText('كلمة المرور لازم تكون 8 أحرف على الأقل')).toBeInTheDocument()
  expect(screen.getByText('كلمتا المرور غير متطابقتين')).toBeInTheDocument()
})

it('keeps the submit button disabled until the contract is accepted', async () => {
  setup()
  await chooseRole('مستشفى')
  await fillHospital()
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  const submit = screen.getByRole('button', { name: 'وقّع وأرسل الطلب' })
  expect(submit).toBeDisabled()
  await userEvent.type(screen.getByLabelText('اسم الموقّع'), 'أح')
  await userEvent.click(screen.getByRole('checkbox', { name: 'قرأت العقد وأوافق عليه' }))
  expect(submit).toBeDisabled()
  await userEvent.type(screen.getByLabelText('اسم الموقّع'), 'مد')
  expect(submit).toBeEnabled()
})

it('creates the account, submits the exact application, and shows the pending page', async () => {
  const s = setup()
  const signUp = vi.spyOn(s.auth, 'signUp')
  const submitApp = vi.spyOn(s.orgs, 'submitApplication')
  await chooseRole('مستشفى')
  await fillHospital()
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  await signContract()
  await userEvent.click(screen.getByRole('button', { name: 'وقّع وأرسل الطلب' }))
  expect(await screen.findByRole('heading', { name: 'طلبك قيد المراجعة' })).toBeInTheDocument()
  expect(signUp).toHaveBeenCalledTimes(1)
  expect(signUp).toHaveBeenCalledWith('h@test.sa', 'password123')
  expect(submitApp).toHaveBeenCalledTimes(1)
  expect(submitApp.mock.calls[0][1]).toEqual({ role: 'hospital', name: 'مستشفى الملك فهد', city: 'جدة', district: 'الشرفية', licenseNo: 'MOH-12345', hospitalType: 'gov' })
  expect(submitApp.mock.calls[0][2]).toBe('أحمد الغامدي')
})

it('a double click submits only once', async () => {
  const s = setup()
  const submitApp = vi.spyOn(s.orgs, 'submitApplication')
  await chooseRole('مستشفى')
  await fillHospital()
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  await signContract()
  await userEvent.dblClick(screen.getByRole('button', { name: 'وقّع وأرسل الطلب' }))
  await screen.findByRole('heading', { name: 'طلبك قيد المراجعة' })
  expect(submitApp).toHaveBeenCalledTimes(1)
})

it('signed-in user without an org finishes registration without account fields', async () => {
  const s = createFakeServices({ users: [{ uid: 'u1', email: 'h@test.sa', password: 'password123' }], signedIn: 'u1' })
  const signUp = vi.spyOn(s.auth, 'signUp')
  const submitApp = vi.spyOn(s.orgs, 'submitApplication')
  setup(s)
  await chooseRole('مستشفى')
  expect(screen.queryByLabelText('البريد الإلكتروني')).not.toBeInTheDocument()
  await fillHospital({ account: false })
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  await signContract()
  await userEvent.click(screen.getByRole('button', { name: 'وقّع وأرسل الطلب' }))
  await screen.findByRole('heading', { name: 'طلبك قيد المراجعة' })
  expect(signUp).not.toHaveBeenCalled()
  expect(submitApp.mock.calls[0][0]).toEqual({ uid: 'u1', email: 'h@test.sa' })
})

it('an email already in use sends the user back to details with a message', async () => {
  setup(createFakeServices({ users: [{ uid: 'x', email: 'h@test.sa', password: 'password123' }] }))
  await chooseRole('مستشفى')
  await fillHospital()
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  await signContract()
  await userEvent.click(screen.getByRole('button', { name: 'وقّع وأرسل الطلب' }))
  expect(await screen.findByText('هذا البريد مسجّل من قبل')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'بيانات الجهة' })).toBeInTheDocument()
})

it('rejects a malformed email on the details step', async () => {
  setup()
  await chooseRole('مستشفى')
  await fillHospital({ email: 'ahmed.gmail.com' })
  await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
  expect(screen.getByText('صيغة البريد غير صحيحة')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'بيانات الجهة' })).toBeInTheDocument()
})
