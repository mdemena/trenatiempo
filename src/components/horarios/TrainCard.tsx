'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { HorarioEntry, TipoServicio } from '@/lib/renfe/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gtfsToHHMM(time: string): string {
  return time.slice(0, 5) // "HH:MM" from "HH:MM:SS"
}

function resolveType(tren: HorarioEntry): TipoServicio {
  if (tren.tipo) return tren.tipo
  return tren.routeId.startsWith('C') ? 'cercanias' : 'md'
}

// ─── Badge colors ─────────────────────────────────────────────────────────────

const BADGE_COLOR: Record<TipoServicio, string> = {
  cercanias: 'bg-rail-amber/20 text-rail-amber',
  md: 'bg-blue-400/20 text-blue-300',
  ave: 'bg-purple-400/20 text-purple-300',
  regional: 'bg-green-400/20 text-green-300',
  ld: 'bg-white/10 text-rail-cream/60',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TrainCardProps {
  tren: HorarioEntry
  index: number
}

export function TrainCard({ tren, index }: TrainCardProps) {
  const t = useTranslations('horarios')
  const router = useRouter()
  const tipo = resolveType(tren)
  const delayMin = Math.round(tren.delaySeg / 60)
  const displayTime = gtfsToHHMM(tren.salidaReal ?? tren.salidaProgramada)
  const originalTime = tren.salidaReal ? gtfsToHHMM(tren.salidaProgramada) : null

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
      onClick={() => router.push(`/viaje/${tren.tripId}`)}
      className="flex w-full items-center gap-4 rounded-2xl bg-[#0F1E35] px-4 py-4 text-left transition hover:bg-white/5 active:scale-[0.98]"
    >
      {/* Left: departure time */}
      <div className="flex min-w-[3.5rem] flex-col items-center">
        <span
          className={cn(
            'font-display text-2xl font-bold leading-tight',
            tren.cancelado && 'text-rail-cream/30 line-through'
          )}
        >
          {displayTime}
        </span>
        {originalTime && !tren.cancelado && (
          <span className="text-[10px] text-rail-cream/35 line-through">
            {originalTime}
          </span>
        )}
        {tren.anden && (
          <span className="mt-0.5 text-[10px] text-rail-cream/35">
            {t('platform', { number: tren.anden })}
          </span>
        )}
      </div>

      {/* Center: badge + status + destination */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              BADGE_COLOR[tipo]
            )}
          >
            {tren.routeId || tipo.toUpperCase()}
          </span>

          {tren.cancelado ? (
            <span className="text-xs text-red-400">{t('cancelled')}</span>
          ) : tren.delaySeg > 60 ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-rail-amber" />
              <span className="text-rail-amber">{t('delayed', { minutes: delayMin })}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-rail-green" />
              <span className="text-rail-green/80">{t('onTime')}</span>
            </span>
          )}
        </div>

        {tren.destino && (
          <div className="truncate text-sm text-rail-cream/60">
            {t('towards', { destination: tren.destino })}
          </div>
        )}
        {tren.llegadaFinal && (
          <div className="mt-0.5 text-xs text-rail-cream/35">
            → {gtfsToHHMM(tren.llegadaFinal)}
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-rail-cream/20" />
    </motion.button>
  )
}
