import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReverseGeocoder, parseNominatim } from '../../src/features/geo/reverseGeocode'

const answer = (address: Record<string, string>) => ({ address })
const ok = (json: unknown) => ({ ok: true, json: async () => json }) as Response

afterEach(() => { vi.useRealTimers() })

describe('reverse geocoding', () => {
  it('parses a Nominatim answer into city and district', () => {
    expect(parseNominatim(answer({ city: 'جدة', suburb: 'حي الشرفية', state: 'منطقة مكة المكرمة' }))).toEqual({ city: 'جدة', district: 'الشرفية' })
    expect(parseNominatim(answer({ state: 'منطقة مكة المكرمة', neighbourhood: 'العزيزية' }))).toEqual({ city: 'مكة المكرمة', district: 'العزيزية' })
    expect(parseNominatim(answer({ city: 'ينبع', quarter: 'السميري' }))).toEqual({ district: 'السميري' })
    expect(parseNominatim({})).toEqual({})
  })

  it('throttles to one call per second and keeps the last', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn(async () => ok(answer({ city: 'جدة', suburb: 'الشرفية' })))
    const g = createReverseGeocoder(fetchFn)
    const p1 = g({ lat: 21.1, lng: 39.1 })
    await vi.advanceTimersByTimeAsync(200)
    const p2 = g({ lat: 21.2, lng: 39.2 })
    await vi.advanceTimersByTimeAsync(200)
    const p3 = g({ lat: 21.3, lng: 39.3 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(String(fetchFn.mock.calls[1][0])).toContain('lat=21.3')
    expect(await p1).toEqual({ city: 'جدة', district: 'الشرفية' })
    expect(await p2).toBeNull()
    expect(await p3).toEqual({ city: 'جدة', district: 'الشرفية' })
  })

  it('caches repeated points', async () => {
    const fetchFn = vi.fn(async () => ok(answer({ city: 'جدة' })))
    const g = createReverseGeocoder(fetchFn)
    await g({ lat: 21.54331, lng: 39.17281 })
    await g({ lat: 21.54329, lng: 39.17279 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('asks for Arabic results from Nominatim', async () => {
    const fetchFn = vi.fn(async () => ok(answer({})))
    await createReverseGeocoder(fetchFn)({ lat: 21.5, lng: 39.2 })
    const url = String(fetchFn.mock.calls[0][0])
    expect(url).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/reverse\?/)
    expect(url).toContain('accept-language=ar')
    expect(url).toContain('format=jsonv2')
  })

  it('network error resolves null', async () => {
    const g = createReverseGeocoder(vi.fn(async () => { throw new Error('offline') }))
    expect(await g({ lat: 21.5, lng: 39.2 })).toBeNull()
  })
})
