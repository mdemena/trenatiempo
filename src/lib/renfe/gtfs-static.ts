import { supabaseAdmin } from '@/lib/supabase/admin'
import { findNearestStations, boundingBox } from '@/lib/geo/nearest-station'
import type { Estacion, EstacionConDistancia } from './types'

function rowToEstacion(s: {
  id: string
  name: string
  short_name: string | null
  lat: number | null
  lng: number | null
  province: string | null
  region: string | null
  types: string[]
}): Estacion {
  return {
    id: s.id,
    name: s.name,
    shortName: s.short_name ?? undefined,
    lat: s.lat ?? 0,
    lng: s.lng ?? 0,
    province: s.province ?? undefined,
    region: s.region ?? undefined,
    types: s.types as Estacion['types'],
  }
}

const STATION_COLS = 'id, name, short_name, lat, lng, province, region, types' as const

/** Devuelve una estación por su código ADIF / stop_id GTFS. */
export async function getStationById(stopId: string): Promise<Estacion | null> {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select(STATION_COLS)
    .eq('id', stopId)
    .eq('active', true)
    .single()

  if (error || !data) return null
  return rowToEstacion(data)
}

/**
 * Búsqueda fuzzy por nombre de estación.
 * Usa el índice GIN de pg_trgm creado en la migration 001.
 * La cláusula `ilike '%q%'` activa el índice gin_trgm_ops.
 */
export async function searchStations(
  query: string,
  limit = 8
): Promise<Estacion[]> {
  const { data, error } = await supabaseAdmin
    .from('stations')
    .select(STATION_COLS)
    .ilike('name', `%${query.trim()}%`)
    .eq('active', true)
    .order('name')
    .limit(limit)

  if (error || !data) return []
  return data.map(rowToEstacion)
}

/**
 * Estaciones más cercanas a unas coordenadas.
 * Estrategia: bounding box en SQL → Haversine en JS.
 * El bounding box usa el índice B-tree en (lat, lng) para reducir candidatos.
 */
export async function getNearestStations(
  lat: number,
  lng: number,
  limit = 5,
  radiusKm = 50
): Promise<EstacionConDistancia[]> {
  const bbox = boundingBox(lat, lng, radiusKm)

  const { data, error } = await supabaseAdmin
    .from('stations')
    .select(STATION_COLS)
    .gte('lat', bbox.minLat)
    .lte('lat', bbox.maxLat)
    .gte('lng', bbox.minLng)
    .lte('lng', bbox.maxLng)
    .eq('active', true)

  if (error || !data) return []

  const candidates = data.map(rowToEstacion)
  return findNearestStations({ lat, lng }, candidates, limit)
}
