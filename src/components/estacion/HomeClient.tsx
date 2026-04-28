'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { Clock, MapPin } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { StationSearch } from './StationSearch'
import type { Estacion } from '@/lib/renfe/types'

const RECENT_KEY = 'trenatiempo_recent_stations'
const MAX_RECENT = 5

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

export function HomeClient() {
  const t = useTranslations()
  const router = useRouter()
  const [recent, setRecent] = useState<Estacion[]>([])

  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  const handleSelect = useCallback(
    (station: Estacion) => {
      setRecent((prev) => addToRecent(station, prev))
      router.push(`/estacion/${station.id}`)
    },
    [router]
  )

  return (
    <div className="w-full space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <StationSearch onSelect={handleSelect} />
      </motion.div>

      {recent.length > 0 && (
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
          <ul className="space-y-0.5">
            {recent.map((station) => (
              <li key={station.id}>
                <button
                  onClick={() => handleSelect(station)}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition hover:bg-white/5 active:bg-white/8"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-rail-amber/40" />
                  <span className="truncate text-sm text-rail-cream/75">{station.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </div>
  )
}
