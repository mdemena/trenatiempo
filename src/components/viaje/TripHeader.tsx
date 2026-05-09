'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Star, RefreshCw } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { getRouteColors, routeShortName } from '@/lib/renfe/route-colors'
import type { Tren } from '@/lib/renfe/types'
import { PushPermission } from '@/components/pwa/PushPermission'

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

  const firstDep = origin?.salidaReal ?? origin?.salidaProgramada
  const lastArr = destination?.llegadaReal ?? destination?.llegadaProgramada
  const durationMin =
    firstDep && lastArr ? Math.round((lastArr - firstDep) / 60) : null

  const userDepTs = userStop?.salidaReal ?? userStop?.salidaProgramada
  const userDepTime = userDepTs ? formatTime(userDepTs, locale) : null

  // Official line badge colors
  const { bg: badgeBg, text: badgeText } = getRouteColors(tren.routeId)
  const shortName = routeShortName(tren.routeId)

  return (
    <div className="space-y-3 border-b border-rail-border px-4 py-4">
      {/* Origin → Destination */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Route + status row */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* Colored line badge — matches TrainCard LineBadge */}
            <span
              className="inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-wide"
              style={{ backgroundColor: badgeBg, color: badgeText }}
            >
              {shortName || tren.routeId}
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

          {/* Origin → Destination names */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="max-w-[40%] truncate text-rail-cream/45">
              {origin?.nombre || origin?.stopId || '–'}
            </span>
            <span className="shrink-0 text-rail-cream/20">→</span>
            <span className="min-w-0 flex-1 truncate font-medium text-rail-cream/75">
              {destination?.nombre || destination?.stopId || '–'}
            </span>
          </div>
        </div>

        {/* Action slots */}
        <div className="flex shrink-0 gap-1">
          <button
            disabled
            aria-label={t('favorites.addTrip')}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/5 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber"
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
                {Math.floor(durationMin / 60) > 0
                  ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
                  : `${durationMin} min`}
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
