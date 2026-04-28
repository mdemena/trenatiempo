import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/admin-guard'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { adminClient } = guard

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all counts in parallel
  const [
    totalRes,
    activeRes,
    newThisWeekRes,
    localeResults,
    cacheRes,
  ] = await Promise.all([
    adminClient.from('profiles').select('id', { count: 'exact', head: true }),
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen', thirtyDaysAgo),
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    Promise.all(
      (['es', 'ca', 'gl', 'eu', 'en', 'fr'] as const).map((locale) =>
        adminClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('preferred_locale', locale)
          .then(({ count }) => [locale, count ?? 0] as const)
      )
    ),
    adminClient
      .from('adif_cache')
      .select('key, expires_at')
      .order('expires_at', { ascending: false }),
  ])

  const usersByLocale = Object.fromEntries(localeResults) as Record<string, number>

  const cacheEntries = cacheRes.data ?? []
  const latestCache = cacheEntries[0]
  const cacheStatus = {
    entries: cacheEntries.length,
    latestKey: latestCache?.key ?? null,
    expiresAt: latestCache?.expires_at ?? null,
  }

  return NextResponse.json({
    totalUsers: totalRes.count ?? 0,
    activeUsers: activeRes.count ?? 0,
    newUsersThisWeek: newThisWeekRes.count ?? 0,
    usersByLocale,
    cacheStatus,
  })
}
