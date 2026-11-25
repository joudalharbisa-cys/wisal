import { ServiceError, type ServiceErrorCode } from '../../services/types'

const MESSAGES: Record<ServiceErrorCode, string> = {
  'wrong-credentials': 'البريد أو كلمة المرور غير صحيحة',
  'email-in-use': 'هذا البريد مسجّل من قبل',
  'weak-password': 'كلمة المرور لازم تكون 8 أحرف على الأقل',
  network: 'تعذّر الاتصال، حاول مرة ثانية',
  'invalid-email': 'صيغة البريد غير صحيحة',
  'invalid-transition': 'صار خطأ غير متوقع، حاول مرة ثانية',
  unknown: 'صار خطأ غير متوقع، حاول مرة ثانية',
}

export function authErrorMessage(code: ServiceErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.unknown
}

const FIREBASE: Record<string, ServiceErrorCode> = {
  'auth/invalid-credential': 'wrong-credentials',
  'auth/wrong-password': 'wrong-credentials',
  'auth/user-not-found': 'wrong-credentials',
  'auth/invalid-email': 'invalid-email',
  'auth/email-already-in-use': 'email-in-use',
  'auth/weak-password': 'weak-password',
  'auth/network-request-failed': 'network',
  unavailable: 'network',
}

export function toServiceError(e: unknown): ServiceError {
  if (e instanceof ServiceError) return e
  const code = (e as { code?: string })?.code ?? ''
  return new ServiceError(FIREBASE[code] ?? 'unknown', (e as Error)?.message)
}

export function errorMessage(e: unknown): string {
  return authErrorMessage(toServiceError(e).code)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Basic format check before calling Firebase. */
export function isEmail(v: string): boolean {
  return EMAIL.test(v.trim())
}
