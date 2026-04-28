import { supabaseAdmin } from '@/lib/supabase/admin'
import { RENFE_GTFSRT, CACHE_TTL } from './endpoints'
import type {
  GtfsRtFeed,
  FeedResult,
  TripUpdate,
  VehiclePosition,
} from './types'

type FeedType = 'cercanias' | 'md'

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function readCache(key: string): Promise<{ data: GtfsRtFeed; expired: boolean } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('adif_cache')
      .select('data, expires_at')
      .eq('key', key)
      .single()

    if (error || !data) return null

    return {
      data: data.data as unknown as GtfsRtFeed,
      expired: new Date(data.expires_at) <= new Date(),
    }
  } catch {
    return null
  }
}

async function writeCache(key: string, feed: GtfsRtFeed, ttlSeconds: number): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
    await supabaseAdmin
      .from('adif_cache')
      .upsert({ key, data: feed as unknown as import('@/types/database').Json, expires_at: expiresAt }, { onConflict: 'key' })
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Generic fetch with cache ─────────────────────────────────────────────────

async function fetchWithCache(url: string, cacheKey: string, ttl: number): Promise<FeedResult> {
  // 1. Try fresh cache
  const cached = await readCache(cacheKey)
  if (cached && !cached.expired) {
    return { feed: cached.data, stale: false, fetchedAt: Date.now() }
  }

  // 2. Fetch from Renfe
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`GTFS-RT ${res.status}: ${res.statusText}`)

    const feed = (await res.json()) as GtfsRtFeed
    const fetchedAt = Date.now()

    // 3. Persist to cache (non-blocking)
    void writeCache(cacheKey, feed, ttl)

    return { feed, stale: false, fetchedAt }
  } catch (fetchError) {
    // 4. Fallback to stale cache rather than throwing
    if (cached) {
      console.error(`[gtfs-rt] Fetch failed, serving stale cache for ${cacheKey}:`, fetchError)
      return { feed: cached.data, stale: true, fetchedAt: Date.now() }
    }
    throw fetchError
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchTripUpdates(tipo: FeedType): Promise<FeedResult> {
  const url = tipo === 'cercanias' ? RENFE_GTFSRT.tripUpdatesCercanias : RENFE_GTFSRT.tripUpdatesLD
  const cacheKey = `gtfsrt:trip_updates:${tipo}`
  const ttl = CACHE_TTL[tipo]
  return fetchWithCache(url, cacheKey, ttl)
}

export async function fetchVehiclePositions(tipo: FeedType): Promise<FeedResult> {
  const url =
    tipo === 'cercanias'
      ? RENFE_GTFSRT.vehiclePositionsCercanias
      : RENFE_GTFSRT.vehiclePositionsLD
  const cacheKey = `gtfsrt:vehicle_positions:${tipo}`
  const ttl = CACHE_TTL[tipo]
  return fetchWithCache(url, cacheKey, ttl)
}

// ─── Index helpers ────────────────────────────────────────────────────────────

export function indexTripUpdatesById(feed: GtfsRtFeed): Record<string, TripUpdate> {
  const result: Record<string, TripUpdate> = {}
  for (const entity of feed.entity) {
    if (entity.tripUpdate) {
      result[entity.tripUpdate.trip.tripId] = entity.tripUpdate
    }
  }
  return result
}

export function indexVehiclePositionsById(feed: GtfsRtFeed): Record<string, VehiclePosition> {
  const result: Record<string, VehiclePosition> = {}
  for (const entity of feed.entity) {
    if (entity.vehicle?.trip) {
      result[entity.vehicle.trip.tripId] = entity.vehicle
    }
  }
  return result
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/** Extrae el número de andén del campo label: "C1-23537-PLATF.(3)" → "3" */
export function parseAnden(label: string): string | undefined {
  return label.match(/PLATF\.\((.+?)\)/)?.[1]
}

/** Convierte segundos de delay a estado normalizado */
export function resolveEstado(
  delaySeg: number,
  scheduleRelationship?: string
): 'a_tiempo' | 'retrasado' | 'cancelado' {
  if (scheduleRelationship === 'CANCELED') return 'cancelado'
  if (delaySeg > 120) return 'retrasado'
  return 'a_tiempo'
}
