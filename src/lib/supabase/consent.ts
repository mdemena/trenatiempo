// Persistencia del consentimiento de cookies en Supabase (profiles.consent_choice).
// Solo aplica cuando el usuario está autenticado; los anónimos usan cookie.

import { createClient } from './client'
import type { ConsentChoice } from '@/lib/consent'

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

/** Usuario de la sesión actual, o null si no hay sesión / Supabase no configurado */
export async function getSessionUser(): Promise<{ id: string } | null> {
  if (!isConfigured()) return null
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

/** Elección guardada en Supabase, o null si aún no ha decidido */
export async function fetchRemoteConsent(
  userId: string
): Promise<ConsentChoice | null> {
  if (!isConfigured()) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('consent_choice')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  return data.consent_choice
}

/** Guarda/actualiza la elección del usuario en Supabase */
export async function saveRemoteConsent(
  userId: string,
  choice: ConsentChoice
): Promise<void> {
  if (!isConfigured()) return
  const supabase = createClient()
  await supabase
    .from('profiles')
    .update({ consent_choice: choice })
    .eq('id', userId)
}