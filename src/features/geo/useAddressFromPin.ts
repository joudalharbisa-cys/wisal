import { useEffect, useRef } from 'react'
import type { LatLng } from '../inventory/types'
import { defaultGeocoder, type Address } from './reverseGeocode'

/**
 * When the user places or moves a pin, look up its address and hand the newest answer to `apply`.
 * Pass null for pins that weren't placed by the user (e.g. a loaded warehouse) so stored text isn't replaced.
 */
export function useAddressFromPin(pin: LatLng | null, apply: (a: Address) => void) {
  const applyRef = useRef(apply)
  useEffect(() => { applyRef.current = apply })
  const lat = pin?.lat
  const lng = pin?.lng
  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    let alive = true
    defaultGeocoder({ lat, lng }).then(a => { if (alive && a) applyRef.current(a) })
    return () => { alive = false }
  }, [lat, lng])
}
