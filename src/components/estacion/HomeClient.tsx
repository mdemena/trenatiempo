'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'motion/react'
import { Clock, MapPin, Star } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { StationSearch } from './StationSearch'
import { DatePicker } from '@/components/ui/DatePicker'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { Spinner } from '@/components/ui/Spinner'
import type { Estacion } from '@/lib/renfe/types'

const RECENT_KEY = 'trenatiempo_recent_stations'
const RECENT_EVENT = 'trenatiempo:recents'
const MAX_RECENT = 5

type Tab = 'recent' | 'favorites'

function loadRecent(): Estacion[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Estacion[]
  } catch {
    return []
  }
}

function addToRecent(station: Estacion, prev: Estacion[]): Estacion[] {
  const filtered = prev.filter((s) => s.id !== station.id)
  const next = [station, ...filtered].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  return next
}

let recentCache: Estacion[] = []
let lastRaw: string | null = null

function getRecentSnapshot(): Estacion[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(RECENT_KEY) ?? '[]'
  if (raw !== lastRaw) {
    try {
      recentCache = JSON.parse(raw) as Estacion[]
    } catch {
      recentCache = []
    }
    lastRaw = raw
  }
  return recentCache
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(RECENT_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(RECENT_EVENT, onStoreChange)
  }
}

// ─── Station list ─────────────────────────────────────────────────────────────

function StationList({
  stations,
  onSelect,
}: {
  stations: Estacion[]
  onSelect: (station: Estacion) => void
}) {
  return (
    <ul className="space-y-0.5">
      {stations.map((station) => (
        <li key={station.id}>
          <button
            onClick={() => onSelect(station)}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition hover:bg-white/5 active:bg-white/8"
          >
            <MapPin className="h-4 w-4 shrink-0 text-rail-amber/40" />
            <span className="truncate text-sm text-rail-cream/75">{station.name}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl px-4 py-6 text-center">
      <p className="text-sm font-medium text-rail-cream/50">{title}</p>
      {description && <p className="text-xs text-rail-cream/30">{description}</p>}
    </div>
  )
}

// ─── HomeClient ───────────────────────────────────────────────────────────────

export function HomeClient() {
  const t = useTranslations()
  const router = useRouter()
  const recent = useSyncExternalStore(subscribe, getRecentSnapshot, () => [])
  const [tab, setTab] = useState<Tab>('recent')
  // Fecha de viaje seleccionada (null = hoy)
  const [fecha, setFecha] = useState<string | null>(null)
  const user = useUserStore((s) => s.user)
  const favStations = useFavoritesStore((s) => s.stations)
  const favLoading = useFavoritesStore((s) => s.loading)

  const handleSelect = useCallback(
    (station: Estacion) => {
      addToRecent(station, getRecentSnapshot())
      window.dispatchEvent(new CustomEvent(RECENT_EVENT))
      router.push(`/estacion/${station.id}${fecha ? `?fecha=${fecha}` : ''}`)
    },
    [router, fecha]
  )

  const isLoggedIn = user !== null
  const showTabs = isLoggedIn
  const showRecent = recent.length > 0

  const favoritesContent = favLoading && favStations.length === 0 ? (
    <div className="flex justify-center py-6">
      <Spinner />
    </div>
  ) : favStations.length > 0 ? (
    <StationList stations={favStations} onSelect={handleSelect} />
  ) : (
    <EmptyState title={t('home.noFavorites')} description={t('home.noFavoritesDescription')} />
  )

  return (
    <div className="w-full space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="space-y-3"
      >
        <StationSearch onSelect={handleSelect} />

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-rail-cream/35">
            {t('datePicker.label')}
          </label>
          <DatePicker value={fecha} onChange={setFecha} />
        </div>
      </motion.div>

      {showTabs ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
        >
          <div
            className="flex gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-white/5"
            role="tablist"
            aria-label={t('home.stationTabs')}
          >
            {(
              [
                { key: 'recent', label: t('home.recentStations'), icon: Clock },
                { key: 'favorites', label: t('home.favoritesTab'), icon: Star },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition',
                  tab === key
                    ? 'bg-rail-amber text-rail-navy'
                    : 'text-rail-cream/50 hover:text-rail-cream'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="pt-2">
            <AnimatePresence mode="wait" initial={false}>
              {tab === 'recent' ? (
                <motion.div
                  key="recent"
                  role="tabpanel"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {recent.length > 0 ? (
                    <StationList stations={recent} onSelect={handleSelect} />
                  ) : (
                    <EmptyState
                      title={t('home.noRecent')}
                      description={t('home.noRecentDescription')}
                    />
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="favorites"
                  role="tabpanel"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {favoritesContent}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      ) : (
        showRecent && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
            aria-label={t('home.recentStations')}
          >
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-rail-cream/35">
              <Clock className="h-3.5 w-3.5" />
              {t('home.recentStations')}
            </h2>
            <StationList stations={recent} onSelect={handleSelect} />
          </motion.section>
        )
      )}
    </div>
  )
}
