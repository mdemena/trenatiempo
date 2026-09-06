import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getNearestStations } from '@/lib/renfe/gtfs-static'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  radio: z.coerce.number().min(1).max(200).default(50), // km
})

export async function GET(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'estaciones-cercanas'))
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Inténtalo más tarde.' },
      { status: 429 }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    radio: searchParams.get('radio') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos. Se requieren lat y lng.' },
      { status: 400 }
    )
  }

  const { lat, lng, limit, radio } = parsed.data

  try {
    const estaciones = await getNearestStations(lat, lng, limit, radio)

    return NextResponse.json(
      { estaciones, total: estaciones.length, lat, lng },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800',
        },
      }
    )
  } catch (err) {
    const message =
      err instanceof Error && /Supabase misconfigured/.test(err.message)
        ? 'Configuración de base de datos incompleta en el servidor.'
        : 'Error interno del servidor.'
    console.error('estaciones-cercanas failed:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
