import type { ItemChoice, LatLng, StockRow, Warehouse } from '../inventory/types'
import type { DeliveryMode, Priority, RequestStatus } from '../../lib/labels'

export type Accept = 'new' | 'any'
export const ACCEPT_LABEL: Record<Accept, string> = { new: 'جديد بس', any: 'جديد او مستعمل' }

export type DeliveryPlace = { lat: number; lng: number; city: string; district: string; details: string }

/** What the form holds while the hospital types (strings as typed). */
export type RequestDraft = {
  item: ItemChoice | null
  qty: string
  accept: Accept
  priority: Priority
  beneficiaries: string
  neededBy: string
  receiverName: string
  receiverPhone: string
  /** The pin; its city/district/details are taken from the fields below. */
  delivery: (LatLng & Partial<DeliveryPlace>) | null
  city: string
  district: string
  details: string
}

export type ValidRequest = {
  item: ItemChoice
  qty: number
  accept: Accept
  priority: Priority
  beneficiaries: number
  neededBy: Date
  receiver: { name: string; phone: string }
  delivery: DeliveryPlace
}

export type HospitalRequest = {
  id: string
  hospitalId: string
  hospitalName: string
  itemId: string
  itemName: string
  qty: number
  accept: Accept
  priority: Priority
  beneficiaries: number
  neededBy: Date
  delivery: DeliveryPlace
  status: RequestStatus
  /** status 0 only: true = published for any charity; false = waiting for the hospital (after a rejection). */
  open: boolean
  /** Charities that rejected this request (history). */
  excluded: string[]
  lastRejection?: { charityName: string; reason: string; at: Date }
  /** stockId → quantity held, set when a charity accepts. */
  reservation?: Record<string, number>
  acceptedAt?: Date
  /** Phase 6: when it was sent to the current charity / published as open, and each later step. */
  sentAt?: Date
  publishedAt?: Date
  preparingAt?: Date
  outAt?: Date
  arrivedAt?: Date
  verifiedAt?: Date
  /** Fixed when preparation starts, from the charity's «تقدر توصّل». */
  mode?: DeliveryMode
  driver?: Person
  pickup?: Person
  meeting?: Meeting
  codeFails?: number
  /** Receiver kept inside requests created before phase 5 (no requestContacts doc). */
  legacyReceiver?: Contact
  charityId?: string
  charityName?: string
  warehouseId?: string
  createdAt: Date
  updatedAt: Date
}

/** Receiver details, kept apart from the request: the hospital, and the charity once it accepts. */
export type Contact = { name: string; phone: string }

/** A driver (delivery) or the hospital's courier (pickup), with the expected time. */
export type Person = { name: string; phone: string; eta: Date }
export type Meeting = { at: Date; link: string; byRole: 'hospital' | 'charity'; byName: string }

export type CharityInfo = { id: string; name: string; canDeliver: boolean; workingHours: string }
export type CandidateWarehouse = Warehouse & { orgId: string }
export type Candidates = { charities: CharityInfo[]; warehouses: CandidateWarehouse[]; rows: StockRow[] }
export type Ranked = { charity: CharityInfo; warehouse: CandidateWarehouse; available: number; distanceKm: number; etaHours: number; score: number }
export type CharityChoice = { charityId: string; charityName: string; warehouseId: string }
