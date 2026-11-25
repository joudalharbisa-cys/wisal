import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from './types'

// Inline SVG pin in the brand colours (no image assets to resolve).
const pin = L.divIcon({
  className: '',
  iconSize: [36, 44],
  iconAnchor: [18, 42],
  html: '<svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg"><path d="M18 43s15-14.2 15-25.5C33 8.4 26.3 2 18 2S3 8.4 3 17.5C3 28.8 18 43 18 43z" fill="#0F6B5C" stroke="#fff" stroke-width="3"/><circle cx="18" cy="17" r="5.5" fill="#FBF3E2"/></svg>',
})

function Follow({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap()
  useEffect(() => { map.setView([center.lat, center.lng], zoom) }, [map, center.lat, center.lng, zoom])
  return null
}

function ClickToPlace({ onChange }: { onChange: (v: LatLng) => void }) {
  useMapEvents({ click: e => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Map with a draggable pin; a click on the map moves the pin there. */
export default function LocationMap({ center, value, onChange }: { center: LatLng; value: LatLng | null; onChange: (v: LatLng) => void }) {
  const focus = value ?? center
  return (
    <MapContainer center={[focus.lat, focus.lng]} zoom={value ? 15 : 12} scrollWheelZoom={false} className="absolute inset-0 z-0">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Follow center={focus} zoom={value ? 15 : 12} />
      <ClickToPlace onChange={onChange} />
      {value && (
        <Marker position={[value.lat, value.lng]} icon={pin} draggable
          eventHandlers={{ dragend: e => { const p = (e.target as L.Marker).getLatLng(); onChange({ lat: p.lat, lng: p.lng }) } }} />
      )}
    </MapContainer>
  )
}
