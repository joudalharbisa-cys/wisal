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
