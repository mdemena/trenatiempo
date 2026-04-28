import type { Estacion, EstacionConDistancia } from '@/lib/renfe/types'

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Distancia entre dos coordenadas usando la fórmula de Haversine.
 * Retorna distancia en kilómetros.
 */
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

/**
 * Ordena una lista de estaciones por distancia a unas coordenadas dadas.
 * Acepta estaciones con lat/lng válidos (se filtran las que no tienen coordenadas).
 */
export function findNearestStations(
  coords: { lat: number; lng: number },
  stations: Estacion[],
  limit = 5
): EstacionConDistancia[] {
  return stations
    .filter((s) => s.lat !== 0 || s.lng !== 0)
    .map((s) => ({
      ...s,
      distanciaKm: getDistanceKm(coords.lat, coords.lng, s.lat, s.lng),
    }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, limit)
}

/**
 * Calcula un bounding box rectangular para filtrar estaciones candidatas
 * antes de aplicar Haversine (optimización para queries a BD).
 * Radio en kilómetros.
 */
export function boundingBox(
  lat: number,
  lng: number,
  radiusKm: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos(toRad(lat)))
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  }
}
