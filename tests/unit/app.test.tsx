import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import App from '../../src/App'

it('renders the Wesal home inside RTL document', () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('وصال')
})

it('index.html declares Arabic RTL', () => {
  const html = readFileSync('index.html', 'utf8')
  expect(html).toMatch(/<html[^>]*lang="ar"[^>]*dir="rtl"/)
  expect(html).toContain('<title>وصال</title>')
})
