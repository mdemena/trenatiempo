import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/supabase/admin-guard'

const PAGE_SIZE = 25

// ─── GET /api/admin/usuarios ──────────────────────────────────────────────────

const getSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().optional(),
  role: z.enum(['all', 'user', 'admin']).default('all'),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
})

export async function GET(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { adminClient } = guard
  const { searchParams } = new URL(request.url)

  const parsed = getSchema.safeParse({
    page: searchParams.get('page') ?? 1,
    search: searchParams.get('search') ?? undefined,
    role: searchParams.get('role') ?? 'all',
    status: searchParams.get('status') ?? 'all',
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const { page, search, role, status } = parsed.data
  const offset = (page - 1) * PAGE_SIZE

  let query = adminClient
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`
    )
  }
  if (role !== 'all') {
    query = query.eq('role', role)
  }
  if (status !== 'all') {
    query = query.eq('active', status === 'active')
  }

  const { data: usuarios, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0
  return NextResponse.json({
    usuarios: usuarios ?? [],
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    page,
  })
}

// ─── PATCH /api/admin/usuarios ────────────────────────────────────────────────

const patchSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(['user', 'admin']).optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.role !== undefined || d.active !== undefined, {
    message: 'Provide role or active',
  })

export async function PATCH(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { adminClient, userId: requesterId } = guard

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request', issues: parsed.error.issues }, { status: 400 })
  }

  const { userId, role, active } = parsed.data

  // Prevent admin from modifying their own role or status
  if (userId === requesterId) {
    if (role !== undefined) {
      return NextResponse.json(
        { error: 'No puedes cambiar tu propio rol' },
        { status: 422 }
      )
    }
    if (active === false) {
      return NextResponse.json(
        { error: 'No puedes desactivar tu propia cuenta' },
        { status: 422 }
      )
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (role !== undefined) update.role = role
  if (active !== undefined) update.active = active

  const { data, error } = await adminClient
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, usuario: data })
}
