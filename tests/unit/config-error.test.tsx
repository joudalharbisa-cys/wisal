import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
import ConfigError from '../../src/components/ConfigError'

it('explains missing Firebase settings in Arabic with keys left-to-right', () => {
  render(<ConfigError missing={['VITE_FIREBASE_API_KEY']} />)
  expect(screen.getByRole('alert')).toHaveTextContent('إعدادات Firebase ناقصة')
  expect(screen.getByText('VITE_FIREBASE_API_KEY')).toHaveAttribute('dir', 'ltr')
})
