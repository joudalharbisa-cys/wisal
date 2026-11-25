import { ServiceError } from '../../services/types'
import type { LatLng } from './types'

/** The browser's current position; rejects when unsupported, denied, or timed out. */
export function getCurrentLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    if (!geo) return reject(new ServiceError('unknown', 'geolocation unavailable'))
    geo.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new ServiceError('unknown', 'geolocation failed')),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}
