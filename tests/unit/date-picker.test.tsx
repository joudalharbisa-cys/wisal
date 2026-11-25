import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import DatePicker from '../../src/components/ui/DatePicker'

const MIN = new Date(2026, 10, 25)
const MAX = new Date(2027, 10, 25)

function Host({ onChange = vi.fn() }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState('')
  return <DatePicker label="آخر موعد تحتاجه فيه" value={v} min={MIN} max={MAX} onChange={x => { setV(x); onChange(x) }} />
}

it('picks a day from the calendar', async () => {
  const onChange = vi.fn()
  render(<Host onChange={onChange} />)
  const user = userEvent.setup()
  const field = screen.getByRole('button', { name: 'آخر موعد تحتاجه فيه' })
  expect(field).toHaveTextContent('اختر التاريخ')
  await user.click(field)
  const cal = screen.getByRole('dialog', { name: 'اختر التاريخ' })
  expect(within(cal).getByText('نوفمبر 2026')).toBeInTheDocument()
  await user.click(within(cal).getByRole('button', { name: /27 نوفمبر 2026/ }))
  expect(onChange).toHaveBeenCalledWith('2026-11-27')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(field).toHaveTextContent('27 نوفمبر 2026')
})

it('past days and days beyond a year are disabled', async () => {
  render(<Host />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'آخر موعد تحتاجه فيه' }))
  const cal = screen.getByRole('dialog', { name: 'اختر التاريخ' })
  expect(within(cal).getByRole('button', { name: /24 نوفمبر 2026/ })).toBeDisabled()
  expect(within(cal).getByRole('button', { name: /25 نوفمبر 2026/ })).toBeEnabled()
  expect(within(cal).getByRole('button', { name: 'الشهر السابق' })).toBeDisabled()
  for (let i = 0; i < 12; i++) await user.click(within(cal).getByRole('button', { name: 'الشهر الجاي' }))
  expect(within(cal).getByText('نوفمبر 2027')).toBeInTheDocument()
  expect(within(cal).getByRole('button', { name: /26 نوفمبر 2027/ })).toBeDisabled()
  expect(within(cal).getByRole('button', { name: 'الشهر الجاي' })).toBeDisabled()
})

it('Escape closes the calendar', async () => {
  render(<Host />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'آخر موعد تحتاجه فيه' }))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
