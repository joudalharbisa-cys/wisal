import { it, expect } from 'vitest'
import { authErrorMessage, toServiceError } from '../../src/features/auth/errors'
import { ServiceError } from '../../src/services/types'

it.each([
  ['wrong-credentials', 'البريد أو كلمة المرور غير صحيحة'],
  ['email-in-use', 'هذا البريد مسجّل من قبل'],
  ['weak-password', 'كلمة المرور لازم تكون 8 أحرف على الأقل'],
  ['network', 'تعذّر الاتصال، حاول مرة ثانية'],
  ['invalid-email', 'صيغة البريد غير صحيحة'],
  ['unknown', 'صار خطأ غير متوقع، حاول مرة ثانية'],
] as const)('%s → Arabic message', (code, message) => {
  expect(authErrorMessage(code)).toBe(message)
})

it.each([
  ['auth/invalid-credential', 'wrong-credentials'],
  ['auth/wrong-password', 'wrong-credentials'],
  ['auth/user-not-found', 'wrong-credentials'],
  ['auth/email-already-in-use', 'email-in-use'],
  ['auth/invalid-email', 'invalid-email'],
  ['auth/weak-password', 'weak-password'],
  ['auth/network-request-failed', 'network'],
  ['permission-denied', 'unknown'],
] as const)('Firebase %s → %s', (firebaseCode, code) => {
  const e = toServiceError({ code: firebaseCode })
  expect(e).toBeInstanceOf(ServiceError)
  expect(e.code).toBe(code)
})
