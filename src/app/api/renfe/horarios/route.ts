import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchTripUpdates, fetchVehiclePositions, indexTripUpdatesById, indexVehiclePositionsById, parseAnden, resolveEstado } from '@/lib/renfe/gtfs-rt'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'
import type { HorarioEntry, HorariosResponse } from '@/lib/renfe/types'

const QuerySchema = z.object({
  stopId: z.string().min(1, 'stopId es obligatorio').max(20),
  tipo: z.enum(['cercanias', 'md']).default('cercanias'),
})

/**
 * Convierte "HH:MM:SS" GTFS a un número de segundos desde medianoche.
 * GTFS permite valores > 24h para viajes que pasan la medianoche.
 */
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

/** Hora actual en formato GTFS "HH:MM:SS" */
function nowGtfsTime(): string {
  const now = new Date()
  return secondsToGtfsTime(
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  )
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

  // 1. Obtener GTFS-RT (retrasos y posiciones) — siempre disponible
  const [tripResult, vehicleResult] = await Promise.allSettled([
    fetchTripUpdates(tipo),
    fetchVehiclePositions(tipo),
  ])

  const tripFeedResult = tripResult.status === 'fulfilled' ? tripResult.value : null
  const vehicleFeedResult = vehicleResult.status === 'fulfilled' ? vehicleResult.value : null

  const tripIndex = tripFeedResult ? indexTripUpdatesById(tripFeedResult.feed) : {}
  const vehicleIndex = vehicleFeedResult ? indexVehiclePositionsById(vehicleFeedResult.feed) : {}
  const stale = tripFeedResult?.stale ?? true

  // 2. Obtener horarios base de Supabase (tabla gtfs_stop_times — importada desde GTFS estático).
  // La tabla se crea cuando se ejecuta el script de importación GTFS. Hasta entonces la query
  // falla y se devuelve array vacío (la app funciona con solo datos GTFS-RT cuando los hay).
  type StopTimeRow = { trip_id: string; departure_time: string; stop_sequence: number; route_id?: string }
  const currentTime = nowGtfsTime()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as unknown as { from: (t: string) => any }
  const { data: rawStopTimes, error: stopTimesError } = await db
    .from('gtfs_stop_times')
    .select('trip_id, departure_time, stop_sequence, route_id')
    .eq('stop_id', stopId)
    .gte('departure_time', currentTime)
    .order('departure_time')
    .limit(50)

  if (stopTimesError) {
    const response: HorariosResponse = {
      horarios: [],
      updatedAt: Date.now(),
      stale: true,
    }
    return NextResponse.json(response, { status: 200 })
  }

  const stopTimes: StopTimeRow[] = rawStopTimes ?? []

  // 3. Combinar GTFS estático + GTFS-RT
  const horarios: HorarioEntry[] = stopTimes.map((st) => {
    const rt = tripIndex[st.trip_id]
    const rtStop = rt?.stopTimeUpdate?.find((u) => u.stopId === stopId)
    const delaySeg = rtStop?.departure?.delay ?? 0

    const salidaReal = delaySeg
      ? secondsToGtfsTime(gtfsTimeToSeconds(st.departure_time) + delaySeg)
      : undefined

    const vehicle = vehicleIndex[st.trip_id]
    const anden = vehicle?.label ? parseAnden(vehicle.label) : undefined
    const cancelado = rtStop?.scheduleRelationship === 'CANCELED'

    return {
      tripId: st.trip_id,
      routeId: st.route_id ?? rt?.trip.routeId ?? '',
      salidaProgramada: st.departure_time,
      salidaReal,
      delaySeg,
      cancelado,
      anden,
      estado: resolveEstado(delaySeg, rtStop?.scheduleRelationship),
    }
  })

  const response: HorariosResponse = {
    horarios,
    updatedAt: tripFeedResult?.fetchedAt ?? Date.now(),
    stale,
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      'X-Stale': String(stale),
    },
  })
}
