import { expect, it } from 'vitest'
import { onlyDigits } from '../../src/lib/digits'
import { parsePhone } from '../../src/features/requests/validate'

it('keeps only digits, converts Arabic-Indic, and caps the length', () => {
  expect(onlyDigits('١٢a3-4', 10)).toBe('1234')
  expect(onlyDigits('0551234567890', 10)).toBe('0551234567')
  expect(onlyDigits('4.5', 5)).toBe('45')
  expect(onlyDigits('', 5)).toBe('')
})

it('phones must start with 05 and be exactly 10 digits', () => {
  expect(parsePhone('0551234567')).toBe('0551234567')
  expect(parsePhone('٠٥٥١٢٣٤٥٦٧')).toBe('0551234567')
  for (const bad of ['+966551234567', '551234567', '05512345678', '0451234567', '055123456']) expect(parsePhone(bad)).toBeNull()
})
