/** Append-only step log of a request (`requests/{id}/events/{n}`), written with each step. */
export const EVENT_TYPES = [
  'sent', 'published', 'resent', 'rejected', 'returned', 'taken', 'accepted', 'preparing', 'dispatched', 'ready',
  'arrived', 'pickupSet', 'meetingSet', 'meetingRemoved', 'codeAttempt', 'verified', 'unlocked', 'note',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** Who made a step: an organisation (by its role and name) or the Wesal admin. */
export type Actor = { role: 'hospital' | 'charity' | 'admin'; name: string }
export const ADMIN_ACTOR: Actor = { role: 'admin', name: 'إدارة وصال' }

/** What a step adds to the log; never a receipt code or a typed attempt. */
export type EventInput = { type: EventType; charityName?: string; detail?: string; count?: number }
export type RequestEvent = EventInput & { n: number; requestId: string; at: Date; byRole: Actor['role']; byName: string }
