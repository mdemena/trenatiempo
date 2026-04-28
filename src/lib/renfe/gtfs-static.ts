import type { SupabaseClient } from '@supabase/supabase-js'
import type { Estacion } from '@/types/renfe'
import type { Database } from '@/types/database'

export async function searchStations(
  query: string,
  supabase: SupabaseClient<Database>
): Promise<Estacion[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('id, name, short_name, lat, lng, province, region, types')
    .ilike('name', `%${query}%`)
    .eq('active', true)
    .limit(8)

  if (error || !data) return []

  return data.map((s) => ({
    id: s.id,
    name: s.name,
    shortName: s.short_name ?? undefined,
    lat: s.lat ?? 0,
    lng: s.lng ?? 0,
    province: s.province ?? undefined,
    region: s.region ?? undefined,
    types: (s.types as Estacion['types']) ?? [],
  }))
}
