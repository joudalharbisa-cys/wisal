import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import Button from '../../src/components/ui/Button'
import Card from '../../src/components/ui/Card'
import { PriorityBadge, StatusBadge } from '../../src/components/ui/Badge'
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

it('PriorityBadge is a soft tinted pill', () => {
  render(<PriorityBadge priority="urgent" />)
  expect(screen.getByText('عاجلة').className).toContain('bg-urgent/10')
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
