import { normalizeName } from '../inventory/names'
import type { LatLng } from '../inventory/types'
import { CITIES } from '../orgs/cities'

export type City = (typeof CITIES)[number]
export type Address = { city?: City; district?: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Nominatim reverse answer → one of our cities (if it matches) and the district. */
export function parseNominatim(json: unknown): Address {
  const a = ((json as { address?: Record<string, unknown> })?.address ?? {}) as Record<string, unknown>
  const out: Address = {}
  const district = str(a.suburb) ?? str(a.neighbourhood) ?? str(a.quarter) ?? str(a.city_district)
  if (district) out.district = district.replace(/^حي\s+/, '')
  for (const candidate of [str(a.city), str(a.town), str(a.state)]) {
    if (!candidate) continue
    const n = normalizeName(candidate)
    const city = CITIES.find(c => { const k = normalizeName(c); return n.includes(k) || k.includes(n) })
    if (city) { out.city = city; break }
    if (candidate === str(a.city) || candidate === str(a.town)) break // a named city outside our list: don't fall back to the region
  }
  return out
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Pin → address with Nominatim's usage policy in mind: at most one request per second,
 * only the newest pending point is sent (older calls resolve null), answers cached by ~10 m.
 */
export function createReverseGeocoder(fetchFn: (url: string) => Promise<Response> = url => fetch(url)) {
  const cache = new Map<string, Address>()
  let lastCall = -Infinity
  let seq = 0
  return async (p: LatLng): Promise<Address | null> => {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
    const hit = cache.get(key)
    if (hit) return hit
    const mine = ++seq
    const wait = lastCall + 1000 - Date.now()
    if (wait > 0) await sleep(wait)
    if (mine !== seq) return null
    lastCall = Date.now()
    try {
      const res = await fetchFn(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=ar&lat=${p.lat}&lon=${p.lng}`)
      if (!res.ok) return null
      const address = parseNominatim(await res.json())
      cache.set(key, address)
      return address
    } catch {
      return null
    }
  }
}

export const defaultGeocoder = createReverseGeocoder()
