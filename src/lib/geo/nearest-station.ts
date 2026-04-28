import type { Estacion } from '@/types/renfe'

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function findNearestStations(
  coords: { lat: number; lng: number },
  stations: Estacion[],
  limit = 5
): (Estacion & { distanciaKm: number })[] {
  return stations
    .map((s) => ({
      ...s,
      distanciaKm: getDistanceKm(coords.lat, coords.lng, s.lat, s.lng),
    }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, limit)
}
