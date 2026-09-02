import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/admin-guard'

const PAGE_SIZE = 20

const paramsSchema = z.object({ id: z.string().min(1).max(20) })
const querySchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tipo: z.enum(['all', 'cercanias', 'md']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
})

interface DepartureRow {
  trip_id: string
  route_id: string | null
  departure_time: string
  stop_sequence: number
  feed_source: string
}

/** Resolves the final destination name for a set of trip ids (last stop). */
async function fetchDestinations(
  tripIds: string[],
  userStopId: string,
  db: Awaited<ReturnType<typeof import('@/lib/supabase/server').createAdminClient>>
): Promise<Map<string, string>> {
  if (tripIds.length === 0) return new Map()
  const { data: rows } = await db
    .from('gtfs_stop_times')
    .select('trip_id, stop_id, stop_sequence')
    .in('trip_id', tripIds)
    .order('trip_id')
    .order('stop_sequence', { ascending: false })

  if (!rows?.length) return new Map()

  const lastStopByTrip = new Map<string, string>()
  for (const row of rows as Array<{ trip_id: string; stop_id: string }>) {
    if (!lastStopByTrip.has(row.trip_id)) lastStopByTrip.set(row.trip_id, row.stop_id)
  }
  for (const [tripId, stopId] of lastStopByTrip) {
    if (stopId === userStopId) lastStopByTrip.delete(tripId)
  }
  if (lastStopByTrip.size === 0) return new Map()

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { adminClient } = guard
  const { id } = paramsSchema.parse(await params)
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    fecha: searchParams.get('fecha') ?? undefined,
    tipo: searchParams.get('tipo') ?? 'all',
    page: searchParams.get('page') ?? 1,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const { fecha, tipo, page } = parsed.data
  const today = new Date().toISOString().slice(0, 10)
  const date = fecha ?? today

  const { data: station, error: stationError } = await adminClient
    .from('stations')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (stationError) {
    return NextResponse.json({ error: stationError.message }, { status: 500 })
  }
  if (!station) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  // Fetch static departures for the requested day. p_min_time=null → full day.
  const feeds: string[] = tipo === 'all' ? ['cercanias', 'md'] : [tipo]
  const rpcResults = await Promise.all(
    feeds.map((feed) => adminClient.rpc('get_stop_departures', {
      p_stop_id: id,
      p_date: date,
      p_feed: feed,
      p_min_time: null,
    }))
  )

  const seen = new Set<string>()
  const combined: DepartureRow[] = []
  for (const r of rpcResults) {
    for (const row of (r.data ?? []) as DepartureRow[]) {
      if (seen.has(row.trip_id)) continue
      seen.add(row.trip_id)
      combined.push(row)
    }
  }
  combined.sort((a, b) => {
    const cmp = a.departure_time.localeCompare(b.departure_time)
    return cmp !== 0 ? cmp : a.trip_id.localeCompare(b.trip_id)
  })

  // Paginate
  const total = combined.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageSlice = combined.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const destinations = await fetchDestinations(
    pageSlice.map((r) => r.trip_id),
    id,
    adminClient
  )

  const horarios = pageSlice.map((row) => ({
    tripId: row.trip_id,
    routeId: row.route_id,
    tipo: row.feed_source === 'md' ? 'md' : 'cercanias',
    salidaProgramada: row.departure_time.slice(0, 5),
    destino: destinations.get(row.trip_id) ?? null,
  }))

  return NextResponse.json({
    station,
    horarios,
    total,
    totalPages,
    page,
    pageSize: PAGE_SIZE,
    fecha: date,
    tipo,
  })
}