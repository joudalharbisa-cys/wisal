import { render } from '@testing-library/react'
import { it, expect } from 'vitest'
import LogoMark from '../../src/components/brand/LogoMark'
import BrandBand from '../../src/components/brand/BrandBand'

it('LogoMark is decorative', () => {
  const { container } = render(<LogoMark />)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden')
})

it('BrandBand is hidden from assistive tech and can be tall', () => {
  const { container } = render(<BrandBand tall />)
  const band = container.firstElementChild!
  expect(band).toHaveAttribute('aria-hidden', 'true')
  expect(band.className).toContain('h-[468px]')
})
