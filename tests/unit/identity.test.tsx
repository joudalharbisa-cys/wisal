import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'

it('identity page shows every token and badge', () => {
  render(<ServicesProvider services={createFakeServices()}><MemoryRouter initialEntries={['/identity']}><App /></MemoryRouter></ServicesProvider>)
  for (const t of ['primary', 'accent', 'hospital', 'charity', 'urgent', 'status-6']) expect(screen.getByText(t)).toBeInTheDocument()
  for (const l of ['عاجلة', 'متوسطة', 'عادية']) expect(screen.getByText(l)).toBeInTheDocument()
  expect(screen.getAllByTestId('status-badge')).toHaveLength(7)
  expect(screen.getAllByRole('button')).toHaveLength(4)
  expect(screen.getByRole('table')).toBeInTheDocument()
})
