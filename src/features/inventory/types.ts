import type { OrgRole } from '../orgs/types'

export type Condition = 'new' | 'used'
export type LatLng = { lat: number; lng: number }

/** A product in the shared catalogue. `key` is normalizeName(name) and the Firestore doc id. */
export type Item = { key: string; name: string }

/** What the product picker returns: an existing product, or a name to add as new. */
export type ItemChoice = { kind: 'existing'; item: Item } | { kind: 'new'; name: string }

export type WarehouseDraft = { name: string; city: string; district: string; location: LatLng | null }
export type Warehouse = { id: string; name: string; city: string; district: string; location: LatLng; createdAt: Date; updatedAt: Date }

export type StockRow = {
  id: string
  orgId: string
  orgName: string
  orgRole: OrgRole
  warehouseId: string
  warehouseName: string
  city: string
  itemId: string
  itemName: string
  condition: Condition
  qty: number
  reserved: number
  updatedAt: Date
}

/** The signed-in org as inventory writes need it (denormalised onto stock rows). */
export type OrgRef = { uid: string; name: string; role: OrgRole }

export const CONDITION_LABEL: Record<Condition, string> = { new: 'جديد', used: 'مستعمل' }

export const MAX_QTY = 99999
