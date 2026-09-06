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

// Margen sobre los timeouts internos (Renfe 5s, Supabase 8s) para que la
// función no muera con el límite por defecto de Vercel durante una degradación.
export const maxDuration = 15

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const QuerySchema = z.object({
  stopId: z.string().min(1, 'stopId es obligatorio').max(20),
  tipo: z.enum(['cercanias', 'md']).default('cercanias'),
  /** Fecha de viaje (ISO yyyy-mm-dd). Por defecto hoy. Nunca en pasado. */
  fecha: z
    .string()
    .regex(ISO_DATE, 'fecha debe tener formato YYYY-MM-DD')
    .optional(),
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

type DB = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

/**
 * For each tripId, finds the name of its last stop (destination).
 * Excludes trips whose last stop matches the user's current stopId.
 * Stop times are date-independent now, so no service_date filter is needed.
 */
async function fetchDestinations(
  tripIds: string[],
  userStopId: string,
  db: DB
): Promise<Map<string, string>> {
  if (tripIds.length === 0) return new Map()

  try {
    // Get all stop rows for these trips (ordered desc by stop_sequence)
    const { data: rows } = await db
      .from('gtfs_stop_times')
      .select('trip_id, stop_id, stop_sequence')
      .in('trip_id', tripIds)
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
  } catch (err) {
    console.error('fetchDestinations failed:', err)
    return new Map()
  }
}

interface DepartureRow {
  trip_id: string
  route_id: string | null
  departure_time: string
  stop_sequence: number
  feed_source: string
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
    tipo: searchParams.get('tipo') ?? undefined,
    fecha: searchParams.get('fecha') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' },
      { status: 400 }
    )
  }

  const { stopId, tipo, fecha } = parsed.data

  // ── Resolve target date (Madrid timezone). Past dates rejected. ──────────
  const today = todayISO()
  const targetDate =
    fecha && fecha >= today ? fecha : fecha ? undefined : today

  if (!targetDate) {
    return NextResponse.json({ error: 'La fecha no puede ser pasada' }, { status: 400 })
  }

  const isToday = targetDate === today
  const db = supabaseAdmin as unknown as DB

  let horariosResult: { horarios: HorarioEntry[]; updatedAt: number; stale: boolean }
  try {
    // ── Static schedule via RPC (calendar-aware) ─────────────────────────────
    const staticQuery = db.rpc('get_stop_departures', {
      p_stop_id: stopId,
      p_date: targetDate,
      p_feed: tipo,
      p_min_time: isToday ? nowGtfsTime() : null,
    })

    // Real-time feeds only make sense for today's trains.
    const [tripResult, vehicleResult, staticResult] = await Promise.allSettled([
      isToday ? fetchTripUpdates(tipo) : Promise.resolve(null),
      isToday ? fetchVehiclePositions(tipo) : Promise.resolve(null),
      staticQuery,
    ])

  const tripFeedResult = tripResult.status === 'fulfilled' ? tripResult.value : null
  const vehicleFeedResult = vehicleResult.status === 'fulfilled' ? vehicleResult.value : null

  if (staticResult.status === 'rejected') {
    console.error('get_stop_departures failed:', staticResult.reason)
  }
  const staticData: DepartureRow[] =
    staticResult.status === 'fulfilled' ? (staticResult.value.data ?? []) : []

  type StopTimeRow = { trip_id: string; departure_time: string; stop_sequence: number; route_id?: string }
  const stopTimes: StopTimeRow[] = staticData.map((r) => ({
    trip_id: r.trip_id,
    departure_time: r.departure_time,
    stop_sequence: r.stop_sequence,
    route_id: r.route_id ?? undefined,
  }))

  // Deduplicate: keep lowest stop_sequence per trip
  const seen = new Set<string>()
  const uniqueStopTimes = stopTimes.filter((st) => {
    if (seen.has(st.trip_id)) return false
    seen.add(st.trip_id)
    return true
  })

  // Build RT indexes (empty for future dates)
  const tripIndex = tripFeedResult ? indexTripUpdatesById(tripFeedResult.feed) : {}
  const vehicleIndex = vehicleFeedResult ? indexVehiclePositionsById(vehicleFeedResult.feed) : {}
  const stale = isToday ? (tripFeedResult?.stale ?? true) : false

  // Kick off destination lookup in parallel with RT index processing
  const destPromise = fetchDestinations(
    uniqueStopTimes.map((st) => st.trip_id),
    stopId,
    db
  )

  let horarios: HorarioEntry[]

  if (uniqueStopTimes.length > 0) {
    // Wait for destinations (fetched in parallel above)
    const destByTrip = await destPromise

    // ── Static schedule + RT overlay (today) or plain static (future) ───────
    horarios = uniqueStopTimes.map((st) => {
      const rt = tripIndex[st.trip_id]
      const rtStop = rt?.stopTimeUpdate?.find((u) => u.stopId === stopId)
      const delaySeg = isToday ? (rtStop?.departure?.delay ?? 0) : 0

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
        cancelado: isToday ? rtStop?.scheduleRelationship === 'CANCELED' : false,
        anden,
        estado: resolveEstado(delaySeg, isToday ? rtStop?.scheduleRelationship : undefined),
        destino: destByTrip.get(st.trip_id),
        numTren: extractNumTren(st.trip_id),
      }
    })
  } else if (tripFeedResult) {
    // ── Fallback: GTFS-RT only (active trains), only valid for today ─────────
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
      stale: stale || (isToday && stopTimes.length === 0),
      fecha: targetDate,
      realtime: isToday,
    }

    return NextResponse.json(response, {
      headers: {
        // Future dates are pure static data — cache them much more aggressively.
        'Cache-Control': isToday
          ? 'public, s-maxage=15, stale-while-revalidate=30'
          : 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Stale': String(response.stale),
        'X-Source': isToday
          ? stopTimes.length > 0
            ? 'static+rt'
            : 'rt-only'
          : 'static-future',
      },
    })
  } catch (err) {
    const message =
      err instanceof Error && /Supabase misconfigured/.test(err.message)
        ? 'Configuración de base de datos incompleta en el servidor.'
        : 'Error interno al cargar horarios.'
    console.error('horarios failed:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
