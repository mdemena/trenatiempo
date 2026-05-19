'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { LogOut, ChevronRight, MapPin, Train, BellRing } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { signOut } from '@/lib/supabase/auth-helpers'
import { useUserStore } from '@/store/userStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { Spinner } from '@/components/ui/Spinner'
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

// ─── Favorite count row ───────────────────────────────────────────────────────

function FavCountRow({
  icon,
  label,
  count,
  href,
}: {
  icon: React.ReactNode
  label: string
  count: number
  href: string
}) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(href)}
      className="flex w-full items-center gap-3 rounded-2xl bg-rail-surface px-4 py-3 text-left transition hover:bg-white/5"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rail-amber/10 text-rail-amber">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-rail-cream">{label}</p>
        <p className="mt-0.5 text-[11px] text-rail-cream/35">
          {count === 0 ? '0' : `${count}`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-rail-cream/20" />
    </button>
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
            className="flex-1 rounded-xl bg-rail-surface py-2.5 text-sm text-rail-cream/60 transition hover:bg-white/12 light:hover:bg-black/10"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={async () => {
              setLoading(true)
              try {
                await signOut()
              } catch {
                // Even if signOut fails locally, clear store and navigate
                useUserStore.getState().clearUser()
              }
              router.replace('/')
            }}
            disabled={loading}
            className="flex flex-1 items-center justify-center rounded-xl bg-red-500/15 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/25 disabled:opacity-50"
          >
            {loading ? (
              <Spinner size="sm" />
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
      className="flex w-full items-center gap-3 rounded-2xl bg-rail-surface px-4 py-3 text-sm text-red-400/80 transition hover:bg-red-500/8 hover:text-red-400"
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
  const stationCount = useFavoritesStore((s) => s.stationIds.size)
  const tripCount = useFavoritesStore((s) => s.trips.length)

  const [pushCount, setPushCount] = useState(0)
  const pushFetchedRef = useRef(false)

  useEffect(() => {
    if (!user || pushFetchedRef.current) return
    pushFetchedRef.current = true

    fetch('/api/push/subscriptions')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPushCount(data.length))
      .catch(() => {})
  }, [user])

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

      {/* Favorites section */}
      <Section title={t('favorites')}>
        <div className="space-y-2">
          <FavCountRow
            icon={<MapPin className="h-4 w-4" />}
            label={t('savedStations')}
            count={stationCount}
            href="/favoritos"
          />
          <FavCountRow
            icon={<Train className="h-4 w-4" />}
            label={t('savedTrips')}
            count={tripCount}
            href="/favoritos"
          />
        </div>
      </Section>

      {/* Notification subscriptions section */}
      <Section title={t('notifications')}>
        <FavCountRow
          icon={<BellRing className="h-4 w-4" />}
          label={t('pushEnabled')}
          count={pushCount}
          href="/alertas"
        />
      </Section>

      {/* Sign out */}
      <div className="px-4">
        <SignOutButton />
      </div>
    </div>
  )
}
