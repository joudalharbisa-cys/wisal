import { useEffect, useState } from 'react'
import type { StockRow } from '../inventory/types'
import type { OrgWithId } from '../orgs/types'
import type { HospitalRequest } from '../requests/types'
import { useServices } from '../../services/ServicesContext'

export type AdminData = { orgs: OrgWithId[] | null; requests: HospitalRequest[] | null; stock: StockRow[] | null; failed: boolean }

/** Live oversight data: every organisation, request and stock row (null until loaded). */
export function useAdminData(): AdminData {
  const { admin } = useServices()
  const [orgs, setOrgs] = useState<OrgWithId[] | null>(null)
  const [requests, setRequests] = useState<HospitalRequest[] | null>(null)
  const [stock, setStock] = useState<StockRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const fail = () => setFailed(true)
    const stops = [admin.watchAllOrgs(setOrgs, fail), admin.watchAllRequests(setRequests, fail), admin.watchAllStock(setStock, fail)]
    return () => stops.forEach(s => s())
  }, [admin])
  return { orgs, requests, stock, failed }
}

/** Ids of approved charities (only their stock can cover a request). */
export const approvedCharities = (orgs: OrgWithId[]) => new Set(orgs.filter(o => o.role === 'charity' && o.status === 'approved').map(o => o.id))

/** «مستشفى الملك فهد ← جمعية البر» / «مفتوح» / «بانتظار قراره». */
export function routeLine(r: HospitalRequest): string {
  if (r.charityName) return `${r.hospitalName} ← ${r.charityName}`
  return `${r.hospitalName} · ${r.status === 0 && r.open ? 'مفتوح' : 'بانتظار قراره'}`
}
