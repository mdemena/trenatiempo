import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'

const PostSchema = z.object({
  tripCode: z.string().min(1).max(50),
  lineName: z.string().nullable().optional(),
  originId: z.string().nullable().optional(),
  destId: z.string().nullable().optional(),
  schedule: z.string().nullable().optional(),
})

export async function GET(request: Request) {
  const rl = checkRateLimit(getRateLimitKey(request, 'favorites'), 30)
  if (!rl.ok) return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('favorite_trips')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Error al obtener favoritos' }, { status: 500 })
  }

  return NextResponse.json({ favorites: data ?? [] })
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

  const { tripCode, lineName, originId, destId, schedule } = parsed.data

  const { error } = await supabaseAdmin
    .from('favorite_trips')
    .insert({
      user_id: user.id,
      trip_code: tripCode,
      line_name: lineName ?? null,
      origin_id: originId ?? null,
      dest_id: destId ?? null,
      schedule: schedule ?? null,
    })

  if (error) {
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
  const tripCode = searchParams.get('tripCode')
  if (!tripCode) {
    return NextResponse.json({ error: 'tripCode es obligatorio' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('favorite_trips')
    .delete()
    .eq('user_id', user.id)
    .eq('trip_code', tripCode)

  if (error) {
    return NextResponse.json({ error: 'Error al eliminar favorito' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
