import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Cliente con service_role para operaciones de servidor sin RLS.
// Solo usar en Route Handlers o scripts de servidor — nunca exponer al cliente.
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
