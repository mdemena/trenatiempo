import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AdminClient = SupabaseClient<Database>

// Sin este timeout, si la BD va lenta o caída las queries se cuelgan y
// arrastran la route handler hasta el límite de Vercel (504 timeout).
const SUPABASE_FETCH_TIMEOUT_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS ?? 8_000)

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS) })

let _client: AdminClient | undefined

function getClient(): AdminClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error(
        'Supabase misconfigured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (server-side). Check the env vars in the deployment.'
      )
    }

    _client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: timedFetch },
    })
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
