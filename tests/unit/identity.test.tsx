import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import App from '../../src/App'

it('identity page shows every token and badge', () => {
  render(<MemoryRouter initialEntries={['/identity']}><App /></MemoryRouter>)
  for (const t of ['primary', 'accent', 'hospital', 'charity', 'urgent', 'status-5']) expect(screen.getByText(t)).toBeInTheDocument()
  for (const l of ['عاجلة', 'متوسطة', 'عادية']) expect(screen.getByText(l)).toBeInTheDocument()
  expect(screen.getAllByTestId('status-badge')).toHaveLength(6)
  expect(screen.getAllByRole('button')).toHaveLength(4)
  expect(screen.getByRole('table')).toBeInTheDocument()
})
