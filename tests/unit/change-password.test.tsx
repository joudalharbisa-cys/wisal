import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { ServicesProvider } from '../../src/services/ServicesContext'
import { createFakeServices } from '../../src/services/fakeServices'
import { ServiceError } from '../../src/services/types'
import type { Org } from '../../src/features/orgs/types'

function make(signedIn = 'h1') {
  return createFakeServices({
    users: [{ uid: 'h1', email: 'h@t.sa', password: 'old-password' }, { uid: 'a1', email: 'a@t.sa', password: 'admin-password' }],
    orgs: { h1: { role: 'hospital', name: 'مستشفى الملك فهد', status: 'approved' } as Org }, admins: ['a1'], signedIn,
  })
}

describe('change password (service)', () => {
  it('needs the current password and 8+ characters, then only the new one signs in', async () => {
    const s = make()
    await expect(s.auth.changePassword('wrong-one', 'new-password')).rejects.toMatchObject({ code: 'wrong-credentials' })
    await expect(s.auth.changePassword('old-password', 'short')).rejects.toMatchObject({ code: 'weak-password' })
    await s.auth.changePassword('old-password', 'new-password')
    await s.auth.signOut()
    await expect(s.auth.signIn('h@t.sa', 'old-password')).rejects.toBeInstanceOf(ServiceError)
    await s.auth.signIn('h@t.sa', 'new-password')
  })
  it('signed out: refused', async () => {
    const s = make()
    await s.auth.signOut()
    await expect(s.auth.changePassword('old-password', 'new-password')).rejects.toBeInstanceOf(ServiceError)
  })
})

function show(path: string, signedIn = 'h1') {
  const s = make(signedIn)
  render(<ServicesProvider services={s}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ServicesProvider>)
  return { s, user: userEvent.setup() }
}
const fill = async (user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) => {
  await user.type(await screen.findByLabelText('كلمة المرور الحالية'), current)
  await user.type(screen.getByLabelText('كلمة المرور الجديدة'), next)
  await user.type(screen.getByLabelText('أعد كتابة كلمة المرور الجديدة'), confirm)
  await user.click(screen.getByRole('button', { name: 'غيّر كلمة المرور' }))
}

describe('change password (page)', () => {
  it('the header links to it, and it checks the fields before sending', async () => {
    const { user } = show('/app')
    expect(await screen.findByRole('link', { name: 'كلمة المرور' })).toHaveAttribute('href', '/app/password')
    await user.click(screen.getByRole('link', { name: 'كلمة المرور' }))
    await fill(user, 'old-password', 'short', 'short')
    expect(screen.getByText('كلمة المرور لازم تكون 8 أحرف على الأقل')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('كلمة المرور الجديدة'))
    await user.clear(screen.getByLabelText('أعد كتابة كلمة المرور الجديدة'))
    await user.type(screen.getByLabelText('كلمة المرور الجديدة'), 'new-password')
    await user.type(screen.getByLabelText('أعد كتابة كلمة المرور الجديدة'), 'new-passwor')
    await user.click(screen.getByRole('button', { name: 'غيّر كلمة المرور' }))
    expect(screen.getByText('الكلمتين مو متطابقتين')).toBeInTheDocument()
  })

  it('a wrong current password says so; a right one changes it', async () => {
    const { s, user } = show('/app/password')
    await fill(user, 'wrong-one', 'new-password')
    expect(await screen.findByText('كلمة المرور الحالية غلط')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('كلمة المرور الحالية'))
    await user.type(screen.getByLabelText('كلمة المرور الحالية'), 'old-password')
    await user.click(screen.getByRole('button', { name: 'غيّر كلمة المرور' }))
    expect(await screen.findByText('تغيّرت كلمة المرور')).toBeInTheDocument()
    expect(s._state.users.find(u => u.uid === 'h1')?.password).toBe('new-password')
    expect(screen.getByLabelText('كلمة المرور الحالية')).toHaveValue('')
  })

  it('the admin has it too', async () => {
    const { user } = show('/admin', 'a1')
    expect(await screen.findByRole('link', { name: 'كلمة المرور' })).toHaveAttribute('href', '/admin/password')
    await user.click(screen.getByRole('link', { name: 'كلمة المرور' }))
    expect(await screen.findByRole('heading', { name: 'تغيير كلمة المرور', level: 1 })).toBeInTheDocument()
  })
})
