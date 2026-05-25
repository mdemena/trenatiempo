import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  fetchTripUpdates,
  fetchVehiclePositions,
  indexTripUpdatesById,
  indexVehiclePositionsById,
  parseAnden,
  resolveEstado,
} from '@/lib/renfe/gtfs-rt'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'
import type { HorarioEntry, HorariosResponse } from '@/lib/renfe/types'

const QuerySchema = z.object({
  stopId: z.string().min(1, 'stopId es obligatorio').max(20),
  tipo: z.enum(['cercanias', 'md']).default('cercanias'),
})

function gtfsTimeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)
}

function secondsToGtfsTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

function nowGtfsTime(): string {
  const now = new Date()
  const madrid = new Date(now.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }))
  return secondsToGtfsTime(
    madrid.getHours() * 3600 + madrid.getMinutes() * 60 + madrid.getSeconds()
  )
}

function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/** Converts a Unix timestamp string/number to "HH:MM:SS" in Europe/Madrid timezone. */
function unixToMadridTime(raw: unknown): string {
  const sec = parseInt(String(raw ?? 0), 10)
  return new Date(sec * 1000).toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Extracts the numeric train identifier from a GTFS tripId like "5116X15734R11" → "15734". */
function extractNumTren(tripId: string): string | undefined {
  const match = tripId.match(/X(\d+)/)
  return match?.[1]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = { from: (t: string) => any }

/**
 * For each tripId, finds the name of its last stop (destination).
 * Excludes trips whose last stop matches the user's current stopId.
 */
async function fetchDestinations(
  tripIds: string[],
  today: string,
  userStopId: string,
  db: DB
): Promise<Map<string, string>> {
  if (tripIds.length === 0) return new Map()

  // Get all stop rows for these trips (only 2 cols, ordered desc by stop_sequence)
  const { data: rows } = await db
    .from('gtfs_stop_times')
    .select('trip_id, stop_id, stop_sequence')
    .in('trip_id', tripIds)
    .eq('service_date', today)
    .order('trip_id')
    .order('stop_sequence', { ascending: false })

  if (!rows?.length) return new Map()

  // First occurrence per trip_id = last stop (since sorted desc)
  const lastStopByTrip = new Map<string, string>()
  for (const row of rows as Array<{ trip_id: string; stop_id: string }>) {
    if (!lastStopByTrip.has(row.trip_id)) {
      lastStopByTrip.set(row.trip_id, row.stop_id)
    }
  }

  // Remove trips whose destination IS the user's stop (train terminates here)
  for (const [tripId, stopId] of lastStopByTrip) {
    if (stopId === userStopId) lastStopByTrip.delete(tripId)
  }

  if (lastStopByTrip.size === 0) return new Map()

  // Fetch station names for unique destination stop IDs
  const destStopIds = [...new Set(lastStopByTrip.values())]
  const { data: stations } = await db
    .from('stations')
    .select('id, name')
    .in('id', destStopIds)

  const nameMap = new Map<string, string>(
    ((stations as Array<{ id: string; name: string }>) ?? []).map((s) => [s.id, s.name])
  )

  const result = new Map<string, string>()
  for (const [tripId, stopId] of lastStopByTrip) {
    const name = nameMap.get(stopId)
    if (name) result.set(tripId, name)
  }
  return result
}

export async function GET(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'horarios'), 120)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Inténtalo más tarde.' },
      { status: 429 }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    stopId: searchParams.get('stopId'),
    tipo: searchParams.get('tipo'),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' },
      { status: 400 }
    )
  }

  const { stopId, tipo } = parsed.data
  const today = todayISO()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as unknown as DB

  // Fetch GTFS-RT and static schedule in parallel
  let query = db
    .from('gtfs_stop_times')
    .select('trip_id, departure_time, stop_sequence, route_id, feed_source')
    .eq('stop_id', stopId)
    .eq('service_date', today)
    .gte('departure_time', nowGtfsTime())

  // Filtrar por tipo según el feed_source de cada viaje:
  //   cercanias → feed del GTFS de Cercanías (incluye Rodalies R-prefixed)
  //   md        → feed del GTFS de AV/LD/MD (incluye Regionales R-prefixed)
  if (tipo === 'cercanias') {
    query = query.eq('feed_source', 'cercanias')
  } else if (tipo === 'md') {
    query = query.eq('feed_source', 'md')
  }

  const [tripResult, vehicleResult, staticResult] = await Promise.allSettled([
    fetchTripUpdates(tipo),
    fetchVehiclePositions(tipo),
    query.order('departure_time').order('stop_sequence').limit(60),
  ])

  const tripFeedResult = tripResult.status === 'fulfilled' ? tripResult.value : null
  const vehicleFeedResult = vehicleResult.status === 'fulfilled' ? vehicleResult.value : null
  const staticData =
    staticResult.status === 'fulfilled' ? (staticResult.value.data ?? []) : []

  type StopTimeRow = { trip_id: string; departure_time: string; stop_sequence: number; route_id?: string }
  const stopTimes: StopTimeRow[] = staticData

  // Deduplicate: keep lowest stop_sequence per trip
  const seen = new Set<string>()
  const uniqueStopTimes = stopTimes.filter((st) => {
    if (seen.has(st.trip_id)) return false
    seen.add(st.trip_id)
    return true
  })

  // Build RT indexes
  const tripIndex = tripFeedResult ? indexTripUpdatesById(tripFeedResult.feed) : {}
  const vehicleIndex = vehicleFeedResult ? indexVehiclePositionsById(vehicleFeedResult.feed) : {}
  const stale = tripFeedResult?.stale ?? true

  // Kick off destination lookup in parallel with RT index processing
  const destPromise = fetchDestinations(
    uniqueStopTimes.map((st) => st.trip_id),
    today,
    stopId,
    db
  )

  let horarios: HorarioEntry[]

  if (uniqueStopTimes.length > 0) {
    // Wait for destinations (fetched in parallel above)
    const destByTrip = await destPromise

    // ── Static schedule + RT overlay ─────────────────────────────────────────
    horarios = uniqueStopTimes.map((st) => {
      const rt = tripIndex[st.trip_id]
      const rtStop = rt?.stopTimeUpdate?.find((u) => u.stopId === stopId)
      const delaySeg = rtStop?.departure?.delay ?? 0

      const salidaReal = delaySeg
        ? secondsToGtfsTime(gtfsTimeToSeconds(st.departure_time) + delaySeg)
        : undefined

      const vehicle = vehicleIndex[st.trip_id]
      const anden = vehicle?.vehicle?.label ? parseAnden(vehicle.vehicle.label) : undefined

      return {
        tripId: st.trip_id,
        routeId: st.route_id ?? rt?.trip.routeId ?? '',
        tipo,
        salidaProgramada: st.departure_time,
        salidaReal,
        delaySeg,
        cancelado: rtStop?.scheduleRelationship === 'CANCELED',
        anden,
        estado: resolveEstado(delaySeg, rtStop?.scheduleRelationship),
        destino: destByTrip.get(st.trip_id),
        numTren: extractNumTren(st.trip_id),
      }
    })
  } else if (tripFeedResult) {
    // ── Fallback: GTFS-RT only (active trains) ────────────────────────────────
    const nowSec = Math.floor(Date.now() / 1000)
    horarios = []

    for (const entity of tripFeedResult.feed.entity) {
      const tu = entity.tripUpdate
      if (!tu?.stopTimeUpdate) continue

      const stopUpdate = tu.stopTimeUpdate.find((u) => u.stopId === stopId)
      if (!stopUpdate) continue

      const predictedSec = parseInt(
        String((stopUpdate.departure?.time ?? stopUpdate.arrival?.time) ?? 0),
        10
      )
      if (!predictedSec || predictedSec < nowSec) continue

      const delaySeg = stopUpdate.departure?.delay ?? stopUpdate.arrival?.delay ?? 0
      const scheduledSec = predictedSec - delaySeg

      const salidaProgramada = unixToMadridTime(scheduledSec)
      const salidaReal = delaySeg !== 0 ? unixToMadridTime(predictedSec) : undefined

      const vehicle = vehicleIndex[tu.trip.tripId]

      horarios.push({
        tripId: tu.trip.tripId,
        routeId: tu.trip.routeId ?? '',
        tipo,
        salidaProgramada,
        salidaReal,
        delaySeg,
        cancelado: stopUpdate.scheduleRelationship === 'CANCELED',
        anden: vehicle?.vehicle?.label ? parseAnden(vehicle.vehicle.label) : undefined,
        estado: resolveEstado(delaySeg, stopUpdate.scheduleRelationship),
        numTren: extractNumTren(tu.trip.tripId),
        // destino not available in RT-only mode
      })
    }

    horarios.sort((a, b) => a.salidaProgramada.localeCompare(b.salidaProgramada))
  } else {
    horarios = []
  }

  const response: HorariosResponse = {
    horarios,
    updatedAt: tripFeedResult?.fetchedAt ?? Date.now(),
    stale: stale || stopTimes.length === 0,
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      'X-Stale': String(stale),
      'X-Source': stopTimes.length > 0 ? 'static+rt' : 'rt-only',
    },
  })
}
