'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { getRouteColors, routeShortName } from '@/lib/renfe/route-colors'
import type { HorarioEntry } from '@/lib/renfe/types'
import { TrainTypeIcon } from './TrainTypeIcon'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gtfsToHHMM(time: string): string {
  return time.slice(0, 5) // "HH:MM:SS" → "HH:MM"
}

// ─── Line badge ───────────────────────────────────────────────────────────────

function LineBadge({ routeId }: { routeId: string }) {
  const short = routeShortName(routeId)
  const { bg, text } = getRouteColors(routeId)

  return (
    <span
      className="inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-wide"
      style={{ backgroundColor: bg, color: text }}
      aria-label={`Línea ${short}`}
    >
      {short || '—'}
    </span>
  )
}

// ─── TrainCard ────────────────────────────────────────────────────────────────

interface TrainCardProps {
  tren: HorarioEntry
  index: number
  stopId: string
}

export function TrainCard({ tren, index, stopId }: TrainCardProps) {
  const t = useTranslations('horarios')
  const router = useRouter()

  const delayMin = Math.round(tren.delaySeg / 60)

  // Show real departure if delayed, strike-through the scheduled one
  const displayTime = gtfsToHHMM(tren.salidaReal ?? tren.salidaProgramada)
  const originalTime = tren.salidaReal ? gtfsToHHMM(tren.salidaProgramada) : null

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
      onClick={() => router.push(`/viaje/${tren.tripId}?stopId=${encodeURIComponent(stopId)}`)}
      className="flex w-full items-center gap-3 rounded-2xl bg-rail-surface px-4 py-3.5 text-left transition hover:bg-white/5 active:scale-[0.98] light:hover:bg-black/5"
    >
      {/* Line badge + type badge + train number stacked */}
      <div className="flex shrink-0 flex-col items-start gap-1">
        <LineBadge routeId={tren.routeId} />
        <TrainTypeIcon tipo={tren.tipo} />
        {tren.numTren && (
          <span className="text-[10px] tabular-nums text-rail-cream/25">
            {t('trainNum', { number: tren.numTren })}
          </span>
        )}
      </div>

      {/* Departure time */}
      <div className="flex min-w-[3rem] flex-col items-end">
        <span
          className={cn(
            'font-display text-xl font-bold leading-tight tabular-nums',
            tren.cancelado ? 'text-rail-cream/30 line-through' : 'text-rail-cream'
          )}
        >
          {displayTime}
        </span>
        {originalTime && !tren.cancelado && (
          <span className="text-[10px] tabular-nums text-rail-cream/35 line-through">
            {originalTime}
          </span>
        )}
      </div>

      {/* Status + destination + platform */}
      <div className="min-w-0 flex-1">
        {/* Status row */}
        {tren.cancelado ? (
          <span className="text-xs font-medium text-red-400">{t('cancelled')}</span>
        ) : tren.delaySeg > 60 ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rail-amber" />
            <span className="text-rail-amber">{t('delayed', { minutes: delayMin })}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rail-green" />
            <span className="text-rail-green/80">{t('onTime')}</span>
          </span>
        )}

        {/* Destination */}
        {tren.destino && (
          <div className="mt-0.5 truncate text-[12px] font-medium text-rail-cream/65">
            {t('towards', { destination: tren.destino })}
          </div>
        )}

        {/* Platform */}
        {tren.anden && (
          <div className="mt-0.5 text-[11px] text-rail-cream/35">
            {t('platform', { number: tren.anden })}
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-rail-cream/20" />
    </motion.button>
  )
}
