'use client'

import { createClient } from '@/lib/supabase/client'
import { useUserStore } from '@/store/userStore'
import type { Locale } from '@/types/database'

// ─── Sign in ─────────────────────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// ─── Sign up ──────────────────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Profile trigger uses full_name from metadata; role always defaults to 'user'
      data: { full_name: fullName },
    },
  })
  if (error) throw error
  return data
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export async function signInWithGoogle(returnUrl?: string) {
  const supabase = createClient()
  const callbackUrl = new URL('/auth/callback', window.location.origin)
  // Preserve locale prefix from current path
  const localeMatch = window.location.pathname.match(/^\/([a-z]{2})\//)
  const locale = localeMatch?.[1] ?? 'es'
  callbackUrl.pathname = `/${locale}/auth/callback`
  if (returnUrl) callbackUrl.searchParams.set('returnUrl', returnUrl)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl.toString() },
  })
  if (error) throw error
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut() {
  // Primero limpiar cookies httpOnly vía API (solo esto cuenta para sb-*)
  try {
    await fetch('/api/auth/signout', { method: 'POST' })
  } catch {
    // fallback: si la API falla (offline, error server), el usuario
    // no quedará atrapado — la store se limpia igual
  }
  useUserStore.getState().clearUser()
}

// ─── Locale sync ─────────────────────────────────────────────────────────────

export async function syncLocaleOnLogin(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('preferred_locale')
    .eq('id', userId)
    .single()

  if (data?.preferred_locale) {
    document.cookie = `NEXT_LOCALE=${data.preferred_locale}; path=/; max-age=31536000; SameSite=Lax`
  }
}

// ─── Get current user + profile ───────────────────────────────────────────────

export async function getCurrentUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { user, profile }
}

// ─── Update preferred locale in Supabase ─────────────────────────────────────

export async function updatePreferredLocale(userId: string, locale: Locale) {
  const supabase = createClient()
  await supabase
    .from('profiles')
    .update({ preferred_locale: locale })
    .eq('id', userId)
}
