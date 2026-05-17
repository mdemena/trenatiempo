'use client'

import { useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Star, Train, MapPin, ArrowLeft } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { getRouteColors, routeShortName } from '@/lib/renfe/route-colors'
import { useFavoritesStore } from '@/store/favoritesStore'
import type { Database } from '@/types/database'

type TripFav = Database['public']['Tables']['favorite_trips']['Row']

interface FavStation {
  station_id: string
  created_at: string
}

interface FavoritosClientProps {
  stations: FavStation[]
  stationNames: Record<string, string>
  trips: TripFav[]
}

function parseTripCode(tripCode: string): { numTren: string | null; lineCode: string | null } {
  const match = tripCode.match(/X(\d+)([A-Za-z0-9]+)$/)
  return { numTren: match?.[1] ?? null, lineCode: match?.[2] ?? null }
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function FavoritosClient({ stations, stationNames, trips }: FavoritosClientProps) {
  const t = useTranslations('favorites')
  const locale = useLocale()
  const router = useRouter()
  const { removeStation, removeTrip } = useFavoritesStore()

  const [localStations, setLocalStations] = useState(stations)
  const [localTrips, setLocalTrips] = useState(trips)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const hasStations = localStations.length > 0
  const hasTrips = localTrips.length > 0
  const isEmpty = !hasStations && !hasTrips

  const handleRemoveStation = useCallback(async (stationId: string) => {
    setRemovingIds((prev) => new Set(prev).add(stationId))
    try {
      const res = await fetch(`/api/favorites/stations?stationId=${encodeURIComponent(stationId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setLocalStations((prev) => prev.filter((s) => s.station_id !== stationId))
        removeStation(stationId)
      }
    } catch {
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(stationId)
        return next
      })
    }
  }, [removeStation])

  const handleRemoveTrip = useCallback(async (tripCode: string) => {
    setRemovingIds((prev) => new Set(prev).add(tripCode))
    try {
      const res = await fetch(`/api/favorites/trips?tripCode=${encodeURIComponent(tripCode)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setLocalTrips((prev) => prev.filter((t) => t.trip_code !== tripCode))
        removeTrip(tripCode)
      }
    } catch {
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(tripCode)
        return next
      })
    }
  }, [removeTrip])

  if (isEmpty) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Star className="h-12 w-12 text-rail-cream/15" />
        <div>
          <p className="text-lg font-semibold text-rail-cream/50">{t('empty')}</p>
          <p className="mt-1 text-sm text-rail-cream/30">{t('emptyDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-rail-navy">
      <header className="flex shrink-0 items-center gap-3 border-b border-rail-border bg-rail-navy/95 px-4 py-3">
        <button
          onClick={() => router.push('/')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5 text-rail-cream/70" />
        </button>
        <h1 className="font-display text-lg font-bold text-rail-cream">{t('title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {hasStations && (
          <section className="pt-4">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-rail-cream/40">
              <MapPin className="h-3 w-3" />
              {t('stations')}
              <span className="text-rail-cream/20">({localStations.length})</span>
            </h2>
            <div className="space-y-2">
              {localStations.map((s) => (
                <div
                  key={s.station_id}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl bg-rail-surface px-4 py-3.5 transition',
                    removingIds.has(s.station_id) && 'opacity-40'
                  )}
                >
                  <button
                    onClick={() => router.push(`/estacion/${s.station_id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-display text-base font-bold text-rail-cream">
                      {stationNames[s.station_id] ?? s.station_id}
                    </p>
                    <p className="mt-0.5 text-[11px] text-rail-cream/25">
                      {formatDate(s.created_at, locale)}
                    </p>
                  </button>

                  <button
                    onClick={() => handleRemoveStation(s.station_id)}
                    disabled={removingIds.has(s.station_id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rail-cream/25 transition hover:bg-white/5 hover:text-red-400"
                    aria-label={t('removeStation')}
                  >
                    <Star className="h-4 w-4 fill-rail-amber text-rail-amber" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasTrips && (
          <section className="pt-6">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-rail-cream/40">
              <Train className="h-3 w-3" />
              {t('trips')}
              <span className="text-rail-cream/20">({localTrips.length})</span>
            </h2>
            <div className="space-y-2">
              {localTrips.map((trip) => {
                const { numTren, lineCode } = parseTripCode(trip.trip_code)
                const { bg, text } = getRouteColors(trip.line_name ?? lineCode ?? '')
                const shortName = routeShortName(trip.line_name ?? lineCode ?? '')

                return (
                  <div
                    key={trip.trip_code}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl bg-rail-surface px-4 py-3.5 transition',
                      removingIds.has(trip.trip_code) && 'opacity-40'
                    )}
                  >
                    <button
                      onClick={() => router.push(`/viaje/${trip.trip_code}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {shortName && (
                        <span
                          className="inline-flex min-w-[2.25rem] shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-wide"
                          style={{ backgroundColor: bg, color: text }}
                        >
                          {shortName}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base font-bold text-rail-cream">
                          {numTren ?? trip.trip_code}
                        </p>
                        <p className="mt-0.5 text-[11px] text-rail-cream/25">
                          {formatDate(trip.created_at, locale)}
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleRemoveTrip(trip.trip_code)}
                      disabled={removingIds.has(trip.trip_code)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rail-cream/25 transition hover:bg-white/5 hover:text-red-400"
                      aria-label={t('removeTrip')}
                    >
                      <Star className="h-4 w-4 fill-rail-amber text-rail-amber" />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
