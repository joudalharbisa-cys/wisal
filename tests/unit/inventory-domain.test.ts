import { describe, expect, it } from 'vitest'
import { findNearDuplicate, isNearDuplicate, isValidItemKey, mergeItems, normalizeName, SEED_ITEMS, stockId } from '../../src/features/inventory/names'
import { parseQty, validateItemName, validateWarehouse } from '../../src/features/inventory/validate'
import { CITIES, CITY_CENTERS } from '../../src/features/orgs/cities'

describe('inventory domain', () => {
  it('normalises Arabic product names', () => {
    expect(normalizeName('  الكراسي   المتحركة ')).toBe('كراسي متحركه')
    expect(normalizeName('أجهزة إسعاف')).toBe('اجهزه اسعاف')
    expect(normalizeName('كـراسيّ')).toBe('كراسي')
    expect(normalizeName('مستشفى')).toBe('مستشفي')
    expect(normalizeName('CPAP  Machine')).toBe('cpap machine')
    expect(normalizeName('الم')).toBe('الم')
  })

  it('flags near duplicates', () => {
    expect(isNearDuplicate('كرسي متحرك', 'كراسي متحركة')).toBe(true)
    expect(isNearDuplicate('كراسي', 'كراسي متحركة')).toBe(true)
    expect(isNearDuplicate('أجهزة تنفس', 'أسرّة طبية')).toBe(false)
    expect(findNearDuplicate('كرسي متحرك', SEED_ITEMS)?.name).toBe('كراسي متحركة')
    expect(findNearDuplicate('الكراسي المتحركة', SEED_ITEMS)).toBeNull()
  })

  it('keys for names with "/" or "__" are still valid doc ids', () => {
    expect(normalizeName('حقن 5/10 مل')).toBe('حقن 5-10 مل')
    expect(isValidItemKey(normalizeName('حقن 5/10 مل'))).toBe(true)
    expect(isValidItemKey(normalizeName('a__b'))).toBe(true)
    expect(validateItemName('..')).toBe('اسم المنتج من 2 إلى 60 حرف')
    expect(validateItemName('5/10')).toBeUndefined()
  })

  it('builds stock ids and checks item keys', () => {
    expect(stockId('w1', 'كراسي متحركه', 'new')).toBe('w1__كراسي متحركه__new')
    expect(isValidItemKey('a/b')).toBe(false)
    expect(isValidItemKey('a__b')).toBe(false)
    expect(isValidItemKey('')).toBe(false)
    expect(isValidItemKey('كراسي متحركه')).toBe(true)
  })

  it('parses quantities with Western or Arabic-Indic digits', () => {
    expect(parseQty('20')).toBe(20)
    expect(parseQty('٢٠')).toBe(20)
    expect(parseQty(' 0 ')).toBe(0)
    for (const bad of ['', '-1', '1.5', '100000', 'abc']) expect(parseQty(bad)).toBeNull()
  })

  it('validates warehouse drafts and product names', () => {
    const ok = { name: 'المستودع الرئيسي', city: 'جدة', district: 'النعيم', location: { lat: 21.62, lng: 39.15 } }
    expect(validateWarehouse(ok)).toEqual({})
    expect(validateWarehouse({ ...ok, location: null }).location).toBe('حدد موقع المستودع على الخريطة')
    expect(validateWarehouse({ ...ok, location: { lat: 40, lng: 39 } }).location).toBe('الموقع لازم يكون داخل السعودية')
    expect(validateWarehouse({ ...ok, name: 'م' }).name).toBe('اكتب اسم المستودع (حرفين على الأقل)')
    expect(validateWarehouse({ ...ok, city: 'دبي' }).city).toBe('اختر المدينة')
    expect(validateWarehouse({ ...ok, district: ' ' }).district).toBe('اكتب الحي')
    expect(validateItemName('ك')).toBe('اسم المنتج من 2 إلى 60 حرف')
    expect(validateItemName('عكازات')).toBeUndefined()
  })

  it('merges db products with the seeds and has a centre for every city', () => {
    expect(SEED_ITEMS.map(i => i.name)).toEqual(['كراسي متحركة', 'أجهزة تنفس', 'أسرّة طبية', 'أجهزة قياس ضغط'])
    expect(mergeItems([{ key: 'عكازات', name: 'عكازات' }])).toHaveLength(5)
    expect(mergeItems([{ key: normalizeName('كراسي متحركة'), name: 'كراسي متحركة' }])).toHaveLength(4)
    for (const c of CITIES) expect(CITY_CENTERS[c]).toBeDefined()
  })
})
