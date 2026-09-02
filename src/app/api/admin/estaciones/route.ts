import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/admin-guard'

const PAGE_SIZE = 25

const getSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  municipality: z.string().trim().max(100).optional(),
  tipo: z.string().trim().max(30).optional(),
})

export async function GET(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { adminClient } = guard
  const { searchParams } = new URL(request.url)

  const parsed = getSchema.safeParse({
    page: searchParams.get('page') ?? 1,
    q: searchParams.get('q') ?? undefined,
    province: searchParams.get('province') ?? undefined,
    municipality: searchParams.get('municipality') ?? undefined,
    tipo: searchParams.get('tipo') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const { page, q, province, municipality, tipo } = parsed.data
  const offset = (page - 1) * PAGE_SIZE

  let query = adminClient
    .from('stations')
    .select('*', { count: 'exact' })
    .order('province', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (q) {
    query = query.or(`name.ilike.%${q}%,short_name.ilike.%${q}%,id.ilike.%${q}%`)
  }
  if (province) {
    query = query.eq('province', province)
  }
  if (municipality) {
    query = query.eq('municipality', municipality)
  }
  if (tipo) {
    query = query.contains('types', [tipo])
  }

  const [{ data: estaciones, count, error }, provResult, muniResult, typesResult] =
    await Promise.all([
      query,
      adminClient
        .from('stations')
        .select('province')
        .not('province', 'is', null)
        .order('province'),
      municipality && province
        ? adminClient
            .from('stations')
            .select('municipality')
            .eq('province', province)
            .not('municipality', 'is', null)
            .order('municipality')
        : Promise.resolve({ data: null }),
      adminClient.from('stations').select('types').not('types', 'is', null),
    ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const provinces = [...new Set((provResult.data ?? []).map((r) => r.province as string))]
  const municipalities = municipality
    ? [...new Set((muniResult.data ?? []).map((r) => r.municipality as string))]
    : []
  const types = [
    ...new Set((typesResult.data ?? []).flatMap((r) => (r.types as string[]) ?? [])),
  ].sort()

  const total = count ?? 0
  return NextResponse.json({
    estaciones: estaciones ?? [],
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    page,
    filter: { provinces, municipalities, types },
  })
}