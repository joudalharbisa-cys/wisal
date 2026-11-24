export type OrgRole = 'hospital' | 'charity'
export type OrgStatus = 'pending' | 'approved' | 'rejected'

export type OrgApplication = {
  role: OrgRole
  name: string
  city: string
  district: string
  licenseNo: string
  /** hospital only (required for hospitals) */
  hospitalType?: 'gov' | 'private'
  /** charity only (required for charities) */
  workingHours?: string
  /** charity only (required for charities) */
  canDeliver?: boolean
}

export type Org = OrgApplication & {
  status: OrgStatus
  rejectReason?: string
  contactEmail: string
  contract: { version: string; acceptedAt: Date; acceptedByName: string }
  createdAt: Date
  updatedAt: Date
  reviewedBy?: string
  reviewedAt?: Date
}

export type OrgWithId = Org & { id: string }
