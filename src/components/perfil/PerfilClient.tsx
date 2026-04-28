'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { User, Globe, Bell, Star, LogOut } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { signOut } from '@/lib/supabase/auth-helpers'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'

type Profile = Database['public']['Tables']['profiles']['Row']

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="px-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-rail-cream/30">
        {title}
      </h2>
      {children}
    </section>
  )
}

// ─── Coming-soon slot ─────────────────────────────────────────────────────────

function ComingSoonSlot({ label }: { label: string }) {
  const t = useTranslations('profile')
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/4 px-4 py-3">
      <span className="text-sm text-rail-cream/40">{label}</span>
      <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] font-medium text-rail-cream/30">
        {t('comingSoon')}
      </span>
    </div>
  )
}

// ─── Sign-out button with confirmation ────────────────────────────────────────

function SignOutButton() {
  const t = useTranslations()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  if (confirming) {
    return (
      <div className="rounded-2xl bg-red-500/8 px-4 py-4 ring-1 ring-red-500/20">
        <p className="mb-3 text-sm text-rail-cream/70">{t('profile.logoutConfirm')}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 rounded-xl bg-white/8 py-2.5 text-sm text-rail-cream/60 transition hover:bg-white/12"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={async () => {
              setLoading(true)
              try {
                await signOut()
                router.replace('/')
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading}
            className="flex flex-1 items-center justify-center rounded-xl bg-red-500/15 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/25 disabled:opacity-50"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
            ) : (
              t('auth.logout')
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex w-full items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-red-400/80 transition hover:bg-red-500/8 hover:text-red-400"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {t('auth.logout')}
    </button>
  )
}

// ─── PerfilClient ─────────────────────────────────────────────────────────────

interface PerfilClientProps {
  user: SupabaseUser
  profile: Profile | null
}

export function PerfilClient({ user, profile }: PerfilClientProps) {
  const t = useTranslations('profile')
  const displayName = profile?.full_name ?? user.email ?? '–'
  const initials = (profile?.full_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()

  return (
    <div className="space-y-6 py-6">
      {/* Header: avatar + name + email */}
      <div className="flex flex-col items-center gap-3 px-4 pb-2">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-20 w-20 rounded-full object-cover ring-2 ring-rail-amber/30"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rail-amber/15 text-2xl font-bold text-rail-amber">
            {initials}
          </div>
        )}
        <div className="text-center">
          <p className="font-display text-lg font-bold text-rail-cream">{displayName}</p>
          <p className="mt-0.5 text-sm text-rail-cream/40">{user.email}</p>
        </div>
      </div>

      {/* Language section */}
      <Section title={t('language')}>
        <p className="mb-3 text-xs text-rail-cream/40">{t('languageDescription')}</p>
        <LocaleSwitcher />
      </Section>

      {/* Favorites section — coming soon */}
      <Section title={t('favorites')}>
        <div className="space-y-2">
          <ComingSoonSlot label={t('savedStations')} />
          <ComingSoonSlot label={t('savedTrips')} />
        </div>
      </Section>

      {/* Notifications section — coming soon */}
      <Section title={t('notifications')}>
        <ComingSoonSlot label={t('pushEnabled')} />
      </Section>

      {/* Sign out */}
      <div className="px-4">
        <SignOutButton />
      </div>
    </div>
  )
}
