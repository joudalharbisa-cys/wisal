import { readFileSync } from 'node:fs'
import { it, expect } from 'vitest'

it('index.html declares Arabic RTL', () => {
  const html = readFileSync('index.html', 'utf8')
  expect(html).toMatch(/<html[^>]*lang="ar"[^>]*dir="rtl"/)
  expect(html).toContain('<title>وصال</title>')
})
