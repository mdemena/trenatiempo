import { NextResponse } from 'next/server'
import { z } from 'zod'
import { searchStations } from '@/lib/renfe/gtfs-static'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'

const QuerySchema = z.object({
  q: z.string().min(1, 'El parámetro q es obligatorio').max(100),
  limit: z.coerce.number().int().min(1).max(20).default(8),
})

export async function GET(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'estaciones'))
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Inténtalo más tarde.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rl.reset / 1000)),
        },
      }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    q: searchParams.get('q'),
    limit: searchParams.get('limit'),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' },
      { status: 400 }
    )
  }

  const { q, limit } = parsed.data
  const estaciones = await searchStations(q, limit)

  return NextResponse.json(
    { estaciones, total: estaciones.length },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-RateLimit-Remaining': String(rl.remaining),
      },
    }
  )
}
