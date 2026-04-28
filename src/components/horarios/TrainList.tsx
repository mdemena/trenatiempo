'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'motion/react'
import { Train, RefreshCw } from 'lucide-react'
import { TrainCard } from './TrainCard'
import type { HorarioEntry } from '@/lib/renfe/types'

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-2xl bg-[#0F1E35] px-4 py-4">
      <div className="h-8 w-14 rounded bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <div className="h-4 w-10 rounded bg-white/10" />
          <div className="h-4 w-16 rounded bg-white/8" />
        </div>
        <div className="h-3 w-28 rounded bg-white/6" />
      </div>
    </div>
  )
}

// ─── Updated-ago counter ──────────────────────────────────────────────────────

function UpdatedAgo({ updatedAt }: { updatedAt: number }) {
  const t = useTranslations('common')
  const [seconds, setSeconds] = useState(() =>
    Math.floor((Date.now() - updatedAt) / 1000)
  )

  useEffect(() => {
    const id = setInterval(
      () => setSeconds(Math.floor((Date.now() - updatedAt) / 1000)),
      1000
    )
    return () => clearInterval(id)
  }, [updatedAt])

  return (
    <span className="text-[11px] text-rail-cream/30">
      {t('updatedAgo', { seconds })}
    </span>
  )
}

// ─── TrainList ────────────────────────────────────────────────────────────────

interface TrainListProps {
  trenes: HorarioEntry[]
  loading: boolean
  error: boolean
  stale: boolean
  updatedAt: number | null
  onRetry: () => void
}

export function TrainList({
  trenes,
  loading,
  error,
  stale,
  updatedAt,
  onRetry,
}: TrainListProps) {
  const t = useTranslations()
  const isInitialLoad = loading && trenes.length === 0

  return (
    <div className="flex-1 px-4 pb-4">
      {/* Top bar: updated-ago + stale indicator */}
      <div className="mb-3 flex h-6 items-center justify-between">
        {updatedAt ? <UpdatedAgo updatedAt={updatedAt} /> : <span />}
        <AnimatePresence>
          {stale && !isInitialLoad && (
            <motion.span
              key="stale"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[11px] text-rail-amber/60"
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              {t('horarios.reconnecting')}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && trenes.length === 0 && (
          <motion.div
            key="error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex items-center justify-between rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/20">
              <span>{t('common.error')}</span>
              <button
                onClick={onRetry}
                className="rounded-lg px-3 py-1 text-xs text-rail-cream/60 transition hover:text-rail-cream"
              >
                {t('common.retry')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skeleton loading */}
      {isInitialLoad && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isInitialLoad && !error && trenes.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Train className="h-10 w-10 text-rail-cream/15" />
          <p className="text-sm text-rail-cream/35">{t('horarios.noTrains')}</p>
        </div>
      )}

      {/* Train cards */}
      {!isInitialLoad && trenes.length > 0 && (
        <div className="space-y-2">
          {trenes.map((tren, idx) => (
            <TrainCard key={tren.tripId} tren={tren} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}
