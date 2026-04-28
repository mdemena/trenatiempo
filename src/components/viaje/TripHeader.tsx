'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Star, RefreshCw } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Tren, TipoServicio } from '@/lib/renfe/types'
import { PushPermission } from '@/components/pwa/PushPermission'

// ─── Badge colors (same palette as TrainCard) ─────────────────────────────────

const BADGE_COLOR: Record<TipoServicio, string> = {
  cercanias: 'bg-rail-amber/20 text-rail-amber',
  md: 'bg-blue-400/20 text-blue-300',
  ave: 'bg-purple-400/20 text-purple-300',
  regional: 'bg-green-400/20 text-green-300',
  ld: 'bg-white/10 text-rail-cream/60',
}

// ─── TripHeader ───────────────────────────────────────────────────────────────

interface TripHeaderProps {
  tren: Tren
  userStopId?: string
  stale: boolean
  updatedAt: number | null
}

export function TripHeader({ tren, userStopId, stale }: TripHeaderProps) {
  const t = useTranslations()
  const locale = useLocale()

  const origin = tren.paradas[0]
  const destination = tren.paradas[tren.paradas.length - 1]
  const userStop = userStopId
    ? tren.paradas.find((p) => p.stopId === userStopId)
    : undefined

  const delayMin = Math.round((tren.retrasoSegundos ?? 0) / 60)

  // Duration: first departure → last arrival (in minutes)
  const firstDep = origin?.salidaReal ?? origin?.salidaProgramada
  const lastArr = destination?.llegadaReal ?? destination?.llegadaProgramada
  const durationMin =
    firstDep && lastArr ? Math.round((lastArr - firstDep) / 60) : null

  // User's departure from their station
  const userDepTs = userStop?.salidaReal ?? userStop?.salidaProgramada
  const userDepTime = userDepTs ? formatTime(userDepTs, locale) : null

  return (
    <div className="space-y-3 border-b border-white/5 px-4 py-4">
      {/* Origin → Destination */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-sm text-rail-cream/45">
            <span className="max-w-[35%] truncate">
              {origin?.nombre || origin?.stopId || '–'}
            </span>
            <span className="shrink-0 text-rail-cream/25">→</span>
            <span className="min-w-0 flex-1 truncate font-medium text-rail-cream/70">
              {destination?.nombre || destination?.stopId || '–'}
            </span>
          </div>

          {/* Route badge + status */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                BADGE_COLOR[tren.tipo]
              )}
            >
              {tren.routeId}
            </span>

            {tren.estado === 'cancelado' ? (
              <span className="text-sm font-semibold text-red-400">
                {t('horarios.cancelled')}
              </span>
            ) : tren.estado === 'retrasado' && delayMin > 0 ? (
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-rail-amber" />
                <span className="text-rail-amber">
                  {t('horarios.delayed', { minutes: delayMin })}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-rail-green" />
                <span className="text-rail-green/80">{t('horarios.onTime')}</span>
              </span>
            )}
          </div>
        </div>

        {/* Action slots */}
        <div className="flex shrink-0 gap-1">
          <button
            disabled
            aria-label={t('favorites.addTrip')}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/5 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]"
          >
            <Star className="h-4 w-4 text-rail-cream/50" />
          </button>
          <PushPermission tripCode={tren.id} />
        </div>
      </div>

      {/* User departure + duration */}
      {(userDepTime || durationMin) && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-rail-cream/40">
          {userDepTime && (
            <div>
              <span className="uppercase tracking-wide">{t('viaje.origin')}</span>
              <span className="ml-2 font-mono text-rail-cream/65">{userDepTime}</span>
            </div>
          )}
          {durationMin !== null && (
            <div>
              <span className="uppercase tracking-wide">{t('viaje.duration')}</span>
              <span className="ml-2 font-mono text-rail-cream/65">
                {Math.floor(durationMin / 60)}h {durationMin % 60}m
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stale indicator */}
      {stale && (
        <p className="flex items-center gap-1.5 text-[11px] text-rail-amber/50">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {t('horarios.reconnecting')}
        </p>
      )}
    </div>
  )
}
