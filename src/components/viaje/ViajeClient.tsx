'use client'

import { useTranslations, useLocale } from 'next-intl'
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useViaje } from '@/hooks/useViaje'
import type { Tren } from '@/lib/renfe/types'
import { StopTimeline } from './StopTimeline'
import { FavoriteButton } from '@/components/favorites/FavoriteButton'
import { PushPermission } from '@/components/pwa/PushPermission'
import { getRouteColors, routeShortName } from '@/lib/renfe/route-colors'
import { formatTime } from '@/lib/utils'

function parseTripId(tripId: string): { numTren: string | null; lineCode: string | null } {
  const match = tripId.match(/X(\d+)([A-Za-z0-9]+)$/)
  return { numTren: match?.[1] ?? null, lineCode: match?.[2] ?? null }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ViajeLoadingSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-4 px-4 py-6">
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
    <div className="mx-4 mb-3 rounded-2xl bg-red-500/10 px-4 py-3 ring-1 ring-red-500/25">
      <p className="text-sm font-semibold text-red-400">{t('cancelledBanner')}</p>
    </div>
  )
}

// ─── Trip info bar ────────────────────────────────────────────────────────────

function TripInfoBar({ tren, userStopId, stale }: {
  tren: Tren
  userStopId?: string
  stale: boolean
}) {
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
  const durationMin = firstDep && lastArr ? Math.round((lastArr - firstDep) / 60) : null
  const userDepTs = userStop?.salidaReal ?? userStop?.salidaProgramada
  const userDepTime = userDepTs ? formatTime(userDepTs, locale) : null

  return (
    <div className="space-y-3 px-4 pb-4">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-2">
        {tren.estado === 'cancelado' ? (
          <span className="text-sm font-semibold text-red-400">{t('horarios.cancelled')}</span>
        ) : tren.estado === 'retrasado' && delayMin > 0 ? (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-rail-amber" />
            <span className="text-rail-amber">{t('horarios.delayed', { minutes: delayMin })}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-rail-green" />
            <span className="text-rail-green/80">{t('horarios.onTime')}</span>
          </span>
        )}
      </div>

      {/* Origin → Destination */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="max-w-[40%] truncate text-rail-cream/45">
          {origin?.nombre || origin?.stopId || '–'}
        </span>
        <span className="shrink-0 text-rail-cream/20">→</span>
        <span className="min-w-0 flex-1 truncate font-medium text-rail-cream/75">
          {destination?.nombre || destination?.stopId || '–'}
        </span>
      </div>

      {/* Times + Duration */}
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

// ─── ViajeClient ─────────────────────────────────────────────────────────────

interface ViajeClientProps {
  tripId: string
  userStopId?: string
}

export function ViajeClient({ tripId, userStopId }: ViajeClientProps) {
  const { tren, loading, error, stale, refresh } = useViaje(tripId)
  const { numTren, lineCode } = parseTripId(tripId)
  const { bg: badgeBg, text: badgeText } = getRouteColors(lineCode ?? '')
  const shortLine = lineCode ? routeShortName(lineCode) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Fixed header — always visible */}
      <header className="shrink-0 border-b border-rail-border bg-rail-navy/95">
        {/* Top row: back + badge + train ref + actions */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href={userStopId ? `/estacion/${userStopId}` : '/'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5 text-rail-cream/70" />
          </Link>

          {shortLine && (
            <span
              className="shrink-0 inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-wide"
              style={{ backgroundColor: badgeBg, color: badgeText }}
            >
              {shortLine}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-rail-cream/35">
              Tren
            </p>
            <p className="truncate font-display text-base font-bold leading-tight text-rail-cream">
              {numTren ?? tripId}
            </p>
          </div>

          {tren && (
            <div className="flex shrink-0 gap-1">
              <FavoriteButton type="trip" id={tren.id} lineName={tren.routeId} />
              <PushPermission tripCode={tren.id} />
            </div>
          )}
        </div>

        {/* Trip info data */}
        {tren && <TripInfoBar tren={tren} userStopId={userStopId} stale={stale} />}

        {/* Cancelled banner inside header */}
        {tren?.estado === 'cancelado' && <CancelledBanner />}
      </header>

      {/* Content area — only StopTimeline scrolls */}
      {loading && !tren && (
        <div className="flex min-h-0 flex-1">
          <ViajeLoadingSkeleton />
        </div>
      )}
      {error && !tren && (
        <div className="flex min-h-0 flex-1">
          <ViajeError onRetry={refresh} />
        </div>
      )}
      {tren && (
        <div className="flex-1 overflow-y-auto">
          <StopTimeline
            paradas={tren.paradas}
            posicionActual={tren.posicionActual}
            userStopId={userStopId}
          />
        </div>
      )}
    </div>
  )
}
