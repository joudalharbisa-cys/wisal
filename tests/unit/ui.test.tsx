import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import Button from '../../src/components/ui/Button'
import Card from '../../src/components/ui/Card'
import { ConditionBadge, PriorityBadge, RoleBadge, StatusBadge } from '../../src/components/ui/Badge'
import Dialog from '../../src/components/ui/Dialog'
import Stat from '../../src/components/ui/Stat'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import Alert from '../../src/components/ui/Alert'
import LtrText from '../../src/components/ui/LtrText'
import Table from '../../src/components/ui/Table'
import Field from '../../src/components/ui/Field'
import Input from '../../src/components/ui/Input'
import Spinner from '../../src/components/ui/Spinner'

it('Button defaults to type=button and primary', () => {
  render(<Button>قبول</Button>)
  const b = screen.getByRole('button', { name: 'قبول' })
  expect(b).toHaveAttribute('type', 'button')
  expect(b.className).toContain('bg-primary')
})

it('PriorityBadge shows Arabic label', () => {
  render(<PriorityBadge priority="urgent" />)
  expect(screen.getByText('عاجلة')).toBeInTheDocument()
})

it('StatusBadge renders all six statuses', () => {
  ;([0, 1, 2, 3, 4, 5] as const).forEach(s => render(<StatusBadge status={s} />))
  expect(screen.getAllByTestId('status-badge')).toHaveLength(6)
  expect(screen.getByText('تم التحقق من الوصول')).toBeInTheDocument()
})

it('Alert danger is announced', () => {
  render(<Alert tone="danger">خطأ</Alert>)
  expect(screen.getByRole('alert')).toHaveTextContent('خطأ')
})

it('Alert info is a polite status', () => {
  render(<Alert tone="info">تم</Alert>)
  expect(screen.getByRole('status')).toHaveTextContent('تم')
})

it('LtrText keeps numbers left-to-right', () => {
  render(<LtrText>4821</LtrText>)
  expect(screen.getByText('4821')).toHaveAttribute('dir', 'ltr')
})

it('Card title is a heading', () => {
  render(<Card title="المخزون">x</Card>)
  expect(screen.getByRole('heading', { name: 'المخزون' })).toBeInTheDocument()
})

it('Table renders column headers and cells', () => {
  render(<Table columns={['الصنف', 'الكمية']} rows={[['كراسي متحركة', 40]]} />)
  expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['الصنف', 'الكمية'])
  expect(screen.getByRole('cell', { name: '40' })).toBeInTheDocument()
})

it('PriorityBadge is a solid light pill (readable on the green band too)', () => {
  render(<><PriorityBadge priority="urgent" /><PriorityBadge priority="medium" /></>)
  expect(screen.getByText('عاجلة').className).toContain('bg-[#FEECEC]')
  expect(screen.getByText('متوسطة').className).toContain('bg-[#FFF1E6]')
  expect(screen.getByText('متوسطة').className).not.toMatch(/bg-medium\/\d+/)
})

it('Button loading disables and announces busy', () => {
  render(<Button loading>إرسال</Button>)
  const b = screen.getByRole('button', { name: /إرسال/ })
  expect(b).toBeDisabled()
  expect(b).toHaveAttribute('aria-busy', 'true')
})

it('Field shows error as alert and marks input invalid', () => {
  render(<Field label="الاسم" error="الاسم مطلوب"><Input invalid /></Field>)
  expect(screen.getByRole('alert')).toHaveTextContent('الاسم مطلوب')
  expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
})

it('Card renders action next to title', () => {
  render(<Card title="الطلبات" action={<span>عرض الكل</span>}>x</Card>)
  expect(screen.getByText('عرض الكل')).toBeInTheDocument()
})

it('Spinner announces loading', () => {
  render(<Spinner />)
  expect(screen.getByRole('status')).toHaveAccessibleName('جاري التحميل')
})

it('dialog closes on Escape', async () => {
  const onClose = vi.fn()
  render(<Dialog title="إضافة منتج" onClose={onClose} footer={null}><input aria-label="المنتج" /></Dialog>)
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('dialog is labelled by its title and has a close button', async () => {
  const onClose = vi.fn()
  render(<Dialog title="إضافة منتج" sub="المستودع الرئيسي" onClose={onClose} footer={null}>محتوى</Dialog>)
  expect(screen.getByRole('dialog', { name: 'إضافة منتج' })).toHaveAttribute('aria-modal', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'إغلاق' }))
  expect(onClose).toHaveBeenCalled()
})

it('condition badge reads جديد / مستعمل', () => {
  render(<><ConditionBadge condition="new" /><ConditionBadge condition="used" /></>)
  expect(screen.getByText('جديد')).toBeInTheDocument()
  expect(screen.getByText('مستعمل')).toBeInTheDocument()
})

it('role badge reads مستشفى / جمعية', () => {
  render(<><RoleBadge role="hospital" /><RoleBadge role="charity" /></>)
  expect(screen.getByText('مستشفى')).toBeInTheDocument()
  expect(screen.getByText('جمعية')).toBeInTheDocument()
})

it('stat shows its label and value', () => {
  render(<Stat label="المستودعات" value={2} icon={null} />)
  expect(screen.getByText('المستودعات')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
})
it('dialog keeps focus where the user is when the parent re-renders, and returns it on close', async () => {
  function Host({ tick, open }: { tick: number; open: boolean }) {
    return (
      <>
        <button>فتح</button>
        {open && <Dialog title="إضافة منتج" onClose={() => {}} footer={null}><input aria-label="المنتج" /><input aria-label="الكمية" data-tick={tick} /></Dialog>}
      </>
    )
  }
  const { rerender } = render(<Host tick={0} open={false} />)
  screen.getByRole('button', { name: 'فتح' }).focus()
  rerender(<Host tick={0} open />)
  expect(screen.getByLabelText('المنتج')).toHaveFocus()
  screen.getByLabelText('الكمية').focus()
  rerender(<Host tick={1} open />)
  expect(screen.getByLabelText('الكمية')).toHaveFocus()
  rerender(<Host tick={1} open={false} />)
  expect(screen.getByRole('button', { name: 'فتح' })).toHaveFocus()
})