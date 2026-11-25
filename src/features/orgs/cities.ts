import type { LatLng } from '../inventory/types'

export const CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الطائف', 'أبها', 'تبوك'] as const

/** Where the warehouse map opens before a pin is placed. */
export const CITY_CENTERS: Record<(typeof CITIES)[number], LatLng> = {
  'الرياض': { lat: 24.7136, lng: 46.6753 },
  'جدة': { lat: 21.5433, lng: 39.1728 },
  'مكة المكرمة': { lat: 21.3891, lng: 39.8579 },
  'المدينة المنورة': { lat: 24.5247, lng: 39.5692 },
  'الدمام': { lat: 26.4207, lng: 50.0888 },
  'الطائف': { lat: 21.2703, lng: 40.4158 },
  'أبها': { lat: 18.2164, lng: 42.5053 },
  'تبوك': { lat: 28.3835, lng: 36.5662 },
}
