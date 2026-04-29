'use client'

import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import { useViaje } from '@/hooks/useViaje'
import { TripHeader } from './TripHeader'
import { StopTimeline } from './StopTimeline'

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ViajeLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 px-4 py-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-12 rounded-md bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/8" />
        </div>
        <div className="h-4 w-3/4 rounded bg-white/8" />
      </div>
      <div className="mt-6 space-y-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="flex w-10 shrink-0 flex-col items-center gap-1">
              <div className={`rounded-full bg-white/10 ${i === 0 ? 'h-4 w-4' : 'h-3 w-3'}`} />
              {i < 6 && <div className="h-8 w-px bg-white/6" />}
            </div>
            <div className="flex-1 space-y-1">
              <div className={`h-3 rounded bg-white/10 ${i === 0 ? 'w-32' : 'w-24'}`} />
              <div className="h-2.5 w-10 rounded bg-white/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ViajeError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('common')
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <AlertCircle className="h-10 w-10 text-red-400/50" />
      <p className="text-sm text-rail-cream/40">{t('error')}</p>
      <button
        onClick={onRetry}
        className="rounded-xl bg-white/8 px-4 py-2 text-sm text-rail-cream/70 transition hover:bg-white/12"
      >
        {t('retry')}
      </button>
    </div>
  )
}

// ─── Cancelled banner ─────────────────────────────────────────────────────────

function CancelledBanner() {
  const t = useTranslations('viaje')
  return (
    <div className="mx-4 my-3 rounded-2xl bg-red-500/10 px-4 py-3 ring-1 ring-red-500/25">
      <p className="text-sm font-semibold text-red-400">{t('cancelledBanner')}</p>
    </div>
  )
}

// ─── ViajeClient ─────────────────────────────────────────────────────────────

interface ViajeClientProps {
  tripId: string
  userStopId?: string
}

export function ViajeClient({ tripId, userStopId }: ViajeClientProps) {
  const { tren, loading, error, stale, updatedAt, refresh } = useViaje(tripId)

  if (loading && !tren) return <ViajeLoadingSkeleton />
  if (error && !tren) return <ViajeError onRetry={refresh} />
  if (!tren) return null

  return (
    <div>
      {tren.estado === 'cancelado' && <CancelledBanner />}

      <TripHeader
        tren={tren}
        userStopId={userStopId}
        stale={stale}
        updatedAt={updatedAt}
      />

      {/* StopTimeline now embeds the train's position directly in the stop list */}
      <StopTimeline
        paradas={tren.paradas}
        posicionActual={tren.posicionActual}
        userStopId={userStopId}
      />
    </div>
  )
}
