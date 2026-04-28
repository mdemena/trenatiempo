import { RENFE_GTFSRT, CACHE_TTL } from './endpoints'
import type { GtfsRtFeed } from '@/types/renfe'

export async function fetchTripUpdates(
  tipo: 'cercanias' | 'md'
): Promise<GtfsRtFeed> {
  const url =
    tipo === 'cercanias'
      ? RENFE_GTFSRT.tripUpdatesCercanias
      : RENFE_GTFSRT.tripUpdatesLD
  const ttl = CACHE_TTL[tipo]

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    next: { revalidate: ttl },
  })

  if (!res.ok) throw new Error(`GTFS-RT fetch failed: ${res.status}`)
  return res.json() as Promise<GtfsRtFeed>
}

export async function fetchVehiclePositions(
  tipo: 'cercanias' | 'md'
): Promise<GtfsRtFeed> {
  const url =
    tipo === 'cercanias'
      ? RENFE_GTFSRT.vehiclePositionsCercanias
      : RENFE_GTFSRT.vehiclePositionsLD
  const ttl = CACHE_TTL[tipo]

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    next: { revalidate: ttl },
  })

  if (!res.ok) throw new Error(`Vehicle positions fetch failed: ${res.status}`)
  return res.json() as Promise<GtfsRtFeed>
}

export function indexByTripId(
  feed: GtfsRtFeed
): Record<string, GtfsRtFeed['entity'][number]> {
  return Object.fromEntries(
    feed.entity.map((e) => [e.tripUpdate?.trip.tripId ?? e.id, e])
  )
}

export function parseAnden(label: string): string | undefined {
  return label.match(/PLATF\.\((.+?)\)/)?.[1]
}
