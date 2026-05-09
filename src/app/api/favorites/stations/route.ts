import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'

const PostSchema = z.object({
  stationId: z.string().min(1).max(20),
})

export async function GET(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'favorites'), 30)
  if (!rl.ok) return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('favorite_stations')
    .select('station_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Error al obtener favoritos' }, { status: 500 })
  }

  return NextResponse.json({ favorites: data?.map((r) => r.station_id) ?? [] })
}

export async function POST(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'favorites'), 30)
  if (!rl.ok) return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parsed = PostSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parámetros inválidos' },
      { status: 400 }
    )
  }

  const { stationId } = parsed.data

  const { error } = await supabaseAdmin
    .from('favorite_stations')
    .insert({ user_id: user.id, station_id: stationId })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: true }) // already exists
    }
    return NextResponse.json({ error: 'Error al guardar favorito' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'favorites'), 30)
  if (!rl.ok) return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const stationId = searchParams.get('stationId')
  if (!stationId) {
    return NextResponse.json({ error: 'stationId es obligatorio' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('favorite_stations')
    .delete()
    .eq('user_id', user.id)
    .eq('station_id', stationId)

  if (error) {
    return NextResponse.json({ error: 'Error al eliminar favorito' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
