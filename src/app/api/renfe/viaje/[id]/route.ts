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
import type { Tren, Parada, TipoServicio } from '@/lib/renfe/types'

const ParamsSchema = z.object({
  id: z.string().min(1).max(50),
})

const QuerySchema = z.object({
  tipo: z.enum(['cercanias', 'md']).default('cercanias'),
})

function inferTipo(routeId: string): TipoServicio {
  const upper = (routeId ?? '').toUpperCase()
  if (/^C\d/.test(upper)) return 'cercanias'
  if (/^(AVE|AVS|AVI|ALC|ALD|ALS)/.test(upper)) return 'ave'
  if (/^R\d/.test(upper) || upper.startsWith('MD')) return 'md'
  return 'md'
}

function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/** Converts a GTFS "HH:MM:SS" (Madrid local time, h may be ≥ 24) to a Unix timestamp (seconds). */
function gtfsTimeToUnix(gtfsTime: string, todayIso: string): number {
  const parts = gtfsTime.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const s = parts[2] ?? 0

  // Hours ≥ 24 indicate next-calendar-day service
  const dayOffset = Math.floor(h / 24)
  const adjH = h % 24

  // Advance date if overflow
  const base = new Date(todayIso + 'T00:00:00Z')
  base.setUTCDate(base.getUTCDate() + dayOffset)
  const adjustedISO = base.toISOString().slice(0, 10)

  // Determine Madrid UTC offset by comparing Madrid hour at UTC noon
  const noonUTC = new Date(adjustedISO + 'T12:00:00Z')
  const madridHourAtNoon = parseInt(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hour12: false,
    }).format(noonUTC),
    10
  )
  const offsetHours = madridHourAtNoon - 12 // e.g. +2 in summer, +1 in winter

  // Madrid midnight in UTC
  const madridMidnightMs =
    new Date(adjustedISO + 'T00:00:00Z').getTime() - offsetHours * 3600 * 1000

  return Math.floor(madridMidnightMs / 1000) + adjH * 3600 + m * 60 + s
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getRateLimitKey(request, 'viaje'), 60)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Inténtalo más tarde.' },
      { status: 429 }
    )
  }

  const rawParams = await params
  const parsedParams = ParamsSchema.safeParse(rawParams)
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'ID de viaje inválido' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const parsedQuery = QuerySchema.safeParse({ tipo: searchParams.get('tipo') })
  const tipo = parsedQuery.success ? parsedQuery.data.tipo : 'cercanias'

  const tripId = parsedParams.data.id
  const today = todayISO()

  // Fetch GTFS-RT and static schedule in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as unknown as { from: (t: string) => any }

  const [tripResult, vehicleResult, staticResult] = await Promise.allSettled([
    fetchTripUpdates(tipo),
    fetchVehiclePositions(tipo),
    db
      .from('gtfs_stop_times')
      .select('stop_id, stop_sequence, departure_time, route_id')
      .eq('trip_id', tripId)
      .eq('service_date', today)
      .order('stop_sequence')
      .limit(100),
  ])

  const tripFeed = tripResult.status === 'fulfilled' ? tripResult.value : null
  const vehicleFeed = vehicleResult.status === 'fulfilled' ? vehicleResult.value : null
  const stopTimesRaw: Array<{
    stop_id: string
    stop_sequence: number
    departure_time: string
    route_id: string
  }> = staticResult.status === 'fulfilled' ? (staticResult.value.data ?? []) : []

  const tripUpdates = tripFeed ? indexTripUpdatesById(tripFeed.feed) : {}
  const tripUpdate = tripUpdates[tripId]
  const vehicleIndex = vehicleFeed ? indexVehiclePositionsById(vehicleFeed.feed) : {}

  // Position (optional)
  let posicionActual: Tren['posicionActual'] | undefined
  const vehicle = vehicleIndex[tripId]
  if (vehicle?.position) {
    posicionActual = {
      lat: vehicle.position.latitude,
      lng: vehicle.position.longitude,
      stopId: vehicle.stopId,
      anden: vehicle.label ? parseAnden(vehicle.label) : undefined,
      enMovimiento: vehicle.currentStatus === 'IN_TRANSIT_TO',
    }
  }

  let paradas: Parada[]
  let routeId: string
  let stale: boolean

  if (stopTimesRaw.length > 0) {
    // ── Static + RT overlay ───────────────────────────────────────────────────
    routeId = stopTimesRaw[0]?.route_id ?? tripUpdate?.trip.routeId ?? ''
    stale = tripFeed?.stale ?? true

    // Fetch station names for all stop_ids
    const stopIds = stopTimesRaw.map((r) => r.stop_id)
    const stationsResult = await db
      .from('stations')
      .select('id, name')
      .in('id', stopIds)

    const nameMap = new Map<string, string>()
    if (stationsResult.data) {
      for (const s of stationsResult.data as { id: string; name: string }[]) {
        nameMap.set(s.id, s.name)
      }
    }

    const last = stopTimesRaw.length - 1

    paradas = stopTimesRaw.map((st, i) => {
      const rtStop = tripUpdate?.stopTimeUpdate?.find((u) => u.stopId === st.stop_id)
      const delaySeg = rtStop?.departure?.delay ?? rtStop?.arrival?.delay ?? 0
      const baseSec = gtfsTimeToUnix(st.departure_time, today)
      const realSec = delaySeg !== 0 ? baseSec + delaySeg : undefined

      const isCurrentStop = posicionActual?.stopId === st.stop_id
      const anden = isCurrentStop ? posicionActual?.anden : undefined

      return {
        stopId: st.stop_id,
        nombre: nameMap.get(st.stop_id) ?? st.stop_id,
        salidaProgramada: baseSec,
        salidaReal: realSec,
        llegadaProgramada: i === last ? baseSec : undefined,
        llegadaReal: i === last ? realSec : undefined,
        delaySeg,
        anden,
        esOrigen: i === 0,
        esDestino: i === last,
      }
    })
  } else if (tripUpdate) {
    // ── Fallback: RT-only ─────────────────────────────────────────────────────
    routeId = tripUpdate.trip.routeId ?? ''
    stale = tripFeed?.stale ?? false

    const updates = tripUpdate.stopTimeUpdate ?? []
    paradas = updates.map((stu, i) => {
      const delaySeg = stu.departure?.delay ?? stu.arrival?.delay ?? 0
      const scheduledSec = stu.departure?.time
        ? (stu.departure.time as number) - delaySeg
        : stu.arrival?.time
          ? (stu.arrival.time as number) - delaySeg
          : undefined
      const realSec =
        stu.departure?.time ?? stu.arrival?.time
          ? ((stu.departure?.time ?? stu.arrival?.time) as number)
          : undefined

      return {
        stopId: stu.stopId ?? '',
        nombre: stu.stopId ?? '',
        salidaProgramada: scheduledSec,
        salidaReal: delaySeg !== 0 ? realSec : undefined,
        llegadaProgramada: i === updates.length - 1 ? scheduledSec : undefined,
        llegadaReal: i === updates.length - 1 && delaySeg !== 0 ? realSec : undefined,
        delaySeg,
        esOrigen: i === 0,
        esDestino: i === updates.length - 1,
      }
    })
  } else {
    return NextResponse.json(
      { error: 'Viaje no encontrado o ya finalizado.' },
      { status: 404 }
    )
  }

  const delaySeg = paradas.find((p) => !p.esOrigen)?.delaySeg ?? paradas[0]?.delaySeg ?? 0
  const tren: Tren = {
    id: tripId,
    routeId,
    tipo: inferTipo(routeId),
    paradas,
    estado: resolveEstado(delaySeg),
    retrasoSegundos: delaySeg > 0 ? delaySeg : undefined,
    posicionActual,
  }

  return NextResponse.json(
    { tren, stale, updatedAt: tripFeed?.fetchedAt ?? Date.now() },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        'X-Stale': String(stale),
        'X-Source': stopTimesRaw.length > 0 ? 'static+rt' : 'rt-only',
      },
    }
  )
}
