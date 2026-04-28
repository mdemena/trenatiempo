import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type AdminGuardResult =
  | { ok: true; adminClient: Awaited<ReturnType<typeof createAdminClient>>; userId: string }
  | { ok: false; response: NextResponse }

/**
 * Verifies the caller has an active session and role='admin'.
 * Uses service_role to bypass RLS when reading profiles.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const adminClient = await createAdminClient()

  const {
    data: { user },
  } = await adminClient.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, adminClient, userId: user.id }
}
