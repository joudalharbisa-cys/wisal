import { readFileSync, existsSync } from 'node:fs'
import { it, expect } from 'vitest'

const path = 'src/styles/theme.css'

it('theme defines every identity color token', () => {
  expect(existsSync(path)).toBe(true)
  const css = readFileSync(path, 'utf8')
  for (const name of ['primary', 'primary-dark', 'primary-light', 'accent', 'accent-light', 'ink', 'muted', 'line', 'surface',
    'hospital', 'charity', 'urgent', 'medium', 'normal', 'status-0', 'status-1', 'status-2', 'status-3', 'status-4', 'status-5'])
    expect(css).toContain(`--color-${name}:`)
})

it('theme font falls back when the Arabic font fails to load', () => {
  const css = readFileSync(path, 'utf8')
  expect(css).toMatch(/--font-sans:\s*"IBM Plex Sans Arabic",\s*Tahoma,\s*sans-serif/)
})

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05)

it('every color used behind white text meets WCAG AA (4.5:1)', () => {
  const css = readFileSync(path, 'utf8')
  for (const name of ['primary', 'primary-dark', 'accent', 'hospital', 'charity', 'urgent', 'medium', 'normal',
    'status-0', 'status-1', 'status-2', 'status-3', 'status-4', 'status-5']) {
    const hex = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))![1]
    expect(contrastWithWhite(hex), `${name} ${hex}`).toBeGreaterThanOrEqual(4.5)
  }
})
