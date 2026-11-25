import type { ItemChoice, LatLng, StockRow, Warehouse } from '../inventory/types'
import type { Priority, RequestStatus } from '../../lib/labels'

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
  receiver: { name: string; phone: string }
  delivery: DeliveryPlace
  status: RequestStatus
  charityId?: string
  charityName?: string
  warehouseId?: string
  createdAt: Date
  updatedAt: Date
}

export type CharityInfo = { id: string; name: string; canDeliver: boolean; workingHours: string }
export type CandidateWarehouse = Warehouse & { orgId: string }
export type Candidates = { charities: CharityInfo[]; warehouses: CandidateWarehouse[]; rows: StockRow[] }
export type Ranked = { charity: CharityInfo; warehouse: CandidateWarehouse; available: number; distanceKm: number; etaHours: number; score: number }
export type CharityChoice = { charityId: string; charityName: string; warehouseId: string }
