import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StockDialog from '../../src/features/inventory/StockDialog'
import { SEED_ITEMS } from '../../src/features/inventory/names'
import type { StockRow, Warehouse } from '../../src/features/inventory/types'

const W: Warehouse = { id: 'w1', name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.62, lng: 39.15 }, createdAt: new Date(), updatedAt: new Date() }
const CHAIRS = SEED_ITEMS[0]
const row = (over: Partial<StockRow> = {}): StockRow => ({
  id: `w1__${CHAIRS.key}__new`, orgId: 'h1', orgName: 'مستشفى', orgRole: 'hospital', warehouseId: 'w1', warehouseName: W.name, city: W.city,
  itemId: CHAIRS.key, itemName: CHAIRS.name, condition: 'new', qty: 40, reserved: 0, updatedAt: new Date(), ...over,
})

function setup(props: Partial<Parameters<typeof StockDialog>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<StockDialog warehouse={W} rows={[]} items={[]} onClose={onClose} onSave={onSave} {...props} />)
  return { onSave, onClose, user: userEvent.setup() }
}
const product = () => screen.getByRole('combobox', { name: 'المنتج' })
const qty = () => screen.getByRole('textbox', { name: 'الكمية' })
const save = () => screen.getByRole('button', { name: 'حفظ' })

describe('stock dialog', () => {
  it('typing shows matching products', async () => {
    const { user } = setup()
    await user.type(product(), 'الكراسي')
    expect(screen.getByRole('option', { name: 'كراسي متحركة' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'أجهزة تنفس' })).not.toBeInTheDocument()
  })

  it('adds a new product after declining the suggestion', async () => {
    const { user, onSave, onClose } = setup()
    await user.type(product(), 'كرسي متحرك')
    await user.click(screen.getByRole('option', { name: 'أضف «كرسي متحرك» كمنتج جديد' }))
    expect(screen.getByText(/تقصد/)).toHaveTextContent('كراسي متحركة')
    await user.click(screen.getByRole('button', { name: 'لا، أضفه كمنتج جديد' }))
    await user.type(qty(), '20')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ kind: 'new', name: 'كرسي متحرك' }, 'new', 20)
    expect(onClose).toHaveBeenCalled()
  })

  it('accepting the suggestion picks the existing product', async () => {
    const { user, onSave } = setup()
    await user.type(product(), 'كرسي متحرك')
    await user.click(screen.getByRole('option', { name: 'أضف «كرسي متحرك» كمنتج جديد' }))
    await user.click(screen.getByRole('button', { name: 'نعم، اختره' }))
    expect(product()).toHaveValue('كراسي متحركة')
    await user.click(screen.getByRole('radio', { name: 'مستعمل' }))
    await user.type(qty(), '5')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ kind: 'existing', item: CHAIRS }, 'used', 5)
  })

  it('rejects a missing product and a bad quantity', async () => {
    const { user, onSave } = setup()
    await user.type(qty(), 'abc')
    await user.click(save())
    expect(screen.getByText('اختر المنتج')).toBeInTheDocument()
    expect(screen.getByText('اكتب الكمية بالأرقام من 0 إلى 99999')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('accepts Arabic-Indic digits', async () => {
    const { user, onSave } = setup()
    await user.type(product(), 'كراسي')
    await user.click(screen.getByRole('option', { name: 'كراسي متحركة' }))
    await user.type(qty(), '٢٠')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ kind: 'existing', item: CHAIRS }, 'new', 20)
  })

  it('edit mode only changes quantity', async () => {
    const r = row({ condition: 'used', qty: 12 })
    const { user, onSave } = setup({ rows: [r], editing: r })
    expect(screen.queryByRole('combobox', { name: 'المنتج' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'تعديل الكمية' })).toHaveTextContent('كراسي متحركة')
    await user.clear(qty())
    await user.type(qty(), '9')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ kind: 'existing', item: CHAIRS }, 'used', 9)
  })

  it('quantity cannot go below what is reserved', async () => {
    const r = row({ qty: 40, reserved: 25 })
    const { user, onSave } = setup({ rows: [r], editing: r })
    await user.clear(qty())
    await user.type(qty(), '10')
    await user.click(save())
    expect(screen.getByText('فيه 25 محجوزة لطلبات، الكمية ما تقل عنها')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('warns when the product and condition already exist', async () => {
    const { user } = setup({ rows: [row()] })
    await user.type(product(), 'كراسي')
    await user.click(screen.getByRole('option', { name: 'كراسي متحركة' }))
    expect(screen.getByText('موجود في هذا المستودع بكمية 40، الكمية الجديدة تحل محلها')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'مستعمل' }))
    expect(screen.queryByText(/موجود في هذا المستودع/)).not.toBeInTheDocument()
  })

  it('picks a product with the keyboard', async () => {
    const { user, onSave } = setup()
    await user.type(product(), 'أجهزة')
    expect(product()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const active = product().getAttribute('aria-activedescendant')
    expect(active && document.getElementById(active)).toHaveAccessibleName('أجهزة قياس ضغط')
    await user.keyboard('{Enter}')
    expect(product()).toHaveValue('أجهزة قياس ضغط')
    await user.type(qty(), '7')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ kind: 'existing', item: SEED_ITEMS[3] }, 'new', 7)
  })

  it('typing an exact product name picks it without clicking', async () => {
    const { user, onSave } = setup()
    await user.type(product(), 'الكراسي المتحركة')
    await user.type(qty(), '2')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ kind: 'existing', item: CHAIRS }, 'new', 2)
  })

  it('shows an error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    const { user, onClose } = setup({ onSave })
    await user.type(product(), 'كراسي')
    await user.click(screen.getByRole('option', { name: 'كراسي متحركة' }))
    await user.type(qty(), '3')
    await user.click(save())
    expect(await screen.findByText('ما قدرنا نحفظ، حاول مرة ثانية')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
