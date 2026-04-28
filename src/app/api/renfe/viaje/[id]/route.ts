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
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'
import type { Tren, Parada, TipoServicio } from '@/lib/renfe/types'

const ParamsSchema = z.object({
  id: z.string().min(1).max(50),
})

const QuerySchema = z.object({
  tipo: z.enum(['cercanias', 'md']).default('cercanias'),
})

function inferTipo(tripId: string): TipoServicio {
  const upper = tripId.toUpperCase()
  if (/^C\d/.test(upper)) return 'cercanias'
  if (/^(AVE|AVS|AVI|AVI|ALC|ALD|ALS)/.test(upper)) return 'ave'
  if (/^R\d/.test(upper) || upper.startsWith('MD')) return 'md'
  return 'md'
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

  const [tripResult, vehicleResult] = await Promise.allSettled([
    fetchTripUpdates(tipo),
    fetchVehiclePositions(tipo),
  ])

  if (tripResult.status === 'rejected') {
    return NextResponse.json(
      { error: 'No se pudo obtener información del tren. Inténtalo más tarde.' },
      { status: 503 }
    )
  }

  const { feed: tripFeed, stale } = tripResult.value
  const tripUpdates = indexTripUpdatesById(tripFeed)
  const tripUpdate = tripUpdates[tripId]

  if (!tripUpdate) {
    return NextResponse.json(
      { error: 'Viaje no encontrado o ya finalizado.' },
      { status: 404 }
    )
  }

  // Posición del vehículo (opcional)
  let posicionActual: Tren['posicionActual'] | undefined
  if (vehicleResult.status === 'fulfilled') {
    const vehicleIndex = indexVehiclePositionsById(vehicleResult.value.feed)
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
  }

  // Construir paradas desde stop_time_updates del GTFS-RT
  const paradas: Parada[] = (tripUpdate.stopTimeUpdate ?? []).map((stu, i, arr) => ({
    stopId: stu.stopId ?? '',
    nombre: stu.stopId ?? '',  // se enriquecerá con datos estáticos cuando estén disponibles
    llegadaProgramada: stu.arrival?.time,
    llegadaReal: stu.arrival?.time
      ? stu.arrival.time + (stu.arrival.delay ?? 0)
      : undefined,
    salidaProgramada: stu.departure?.time,
    salidaReal: stu.departure?.time
      ? stu.departure.time + (stu.departure.delay ?? 0)
      : undefined,
    delaySeg: stu.departure?.delay ?? stu.arrival?.delay ?? 0,
    esOrigen: i === 0,
    esDestino: i === arr.length - 1,
  }))

  const delaySeg = paradas[0]?.delaySeg ?? 0
  const tren: Tren = {
    id: tripId,
    routeId: tripUpdate.trip.routeId,
    tipo: inferTipo(tripId),
    paradas,
    estado: resolveEstado(delaySeg),
    retrasoSegundos: delaySeg > 0 ? delaySeg : undefined,
    posicionActual,
  }

  return NextResponse.json(
    { tren, stale, updatedAt: tripResult.value.fetchedAt },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        'X-Stale': String(stale),
      },
    }
  )
}
