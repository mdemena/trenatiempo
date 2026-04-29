import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AdminClient = SupabaseClient<Database>

let _client: AdminClient | undefined

function getClient(): AdminClient {
  if (!_client) {
    _client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return _client
}

// Proxy defers client creation to first request — safe during Next.js build.
// Solo usar en Route Handlers o scripts de servidor — nunca exponer al cliente.
export const supabaseAdmin: AdminClient = new Proxy({} as AdminClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver)
  },
})
