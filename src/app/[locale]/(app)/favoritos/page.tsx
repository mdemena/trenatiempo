import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { FavoritosClient } from '@/components/favorites/FavoritosClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'favorites' })
  return { title: t('title') }
}

export default async function FavoritosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <FavoritosClient stations={[]} stationNames={{}} trips={[]} />
  }

  const [stationResult, tripResult] = await Promise.all([
    supabaseAdmin
      .from('favorite_stations')
      .select('station_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('favorite_trips')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const stationIds = (stationResult.data ?? []).map((s) => s.station_id)

  const stationNames: Record<string, string> = {}
  if (stationIds.length > 0) {
    const { data: stations } = await supabaseAdmin
      .from('stations')
      .select('id, name, short_name')
      .in('id', stationIds)
    if (stations) {
      for (const s of stations) {
        stationNames[s.id] = s.name
      }
    }
  }

  return (
    <FavoritosClient
      stations={stationResult.data ?? []}
      stationNames={stationNames}
      trips={tripResult.data ?? []}
    />
  )
}
