import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = await createAdminClient()
  const now = new Date().toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [cacheResult, subsResult] = await Promise.all([
    client.from('adif_cache').delete().lt('expires_at', now).select('key'),
    client
      .from('push_subscriptions')
      .delete()
      .eq('active' as never, false)
      .lt('created_at', thirtyDaysAgo)
      .select('id'),
  ])

  return NextResponse.json({
    deletedCache: cacheResult.data?.length ?? 0,
    deletedSubscriptions: subsResult.data?.length ?? 0,
  })
}
