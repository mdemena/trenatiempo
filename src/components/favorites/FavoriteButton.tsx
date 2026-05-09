'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { Spinner } from '@/components/ui/Spinner'
import { AuthRequiredModal } from '@/components/auth/AuthRequiredModal'

type StationFav = { type: 'station'; id: string }
type TripFav = { type: 'trip'; id: string; lineName?: string }

type FavoriteButtonProps = {
  className?: string
  name?: string
} & (StationFav | TripFav)

// ─── Hook: fetch favorite stations on mount when user logs in ────────────────

function useLoadFavorites() {
  const user = useUserStore((s) => s.user)
  const { loaded, loading, setStationIds, setTrips, setLoading } = useFavoritesStore()

  useEffect(() => {
    if (!user || loaded || loading) return
    setLoading(true)

    Promise.all([
      fetch('/api/favorites/stations').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/favorites/trips').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([stations, trips]) => {
        if (stations?.favorites) setStationIds(stations.favorites)
        if (trips?.favorites) setTrips(trips.favorites)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
}

// ─── FavoriteButton ──────────────────────────────────────────────────────────

export function FavoriteButton(props: FavoriteButtonProps) {
  const t = useTranslations('favorites')
  const user = useUserStore((s) => s.user)
  const {
    stationIds,
    trips: tripsStore,
    addStation,
    removeStation,
    addTrip,
    removeTrip,
  } = useFavoritesStore()
  const [loading, setBtnLoading] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useLoadFavorites()

  const isStation = props.type === 'station'
  const id = props.id

  const isFav = isStation
    ? stationIds.has(id)
    : tripsStore.some((t) => t.trip_code === id)

  const handleToggle = useCallback(async () => {
    if (!user) {
      setShowAuth(true)
      return
    }

    setBtnLoading(true)
    try {
      if (isStation) {
        if (isFav) {
          const res = await fetch(`/api/favorites/stations?stationId=${encodeURIComponent(id)}`, {
            method: 'DELETE',
          })
          if (res.ok) removeStation(id)
        } else {
          const res = await fetch('/api/favorites/stations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationId: id }),
          })
          if (res.ok) addStation(id)
        }
      } else {
        const trip = props as TripFav
        if (isFav) {
          const res = await fetch(`/api/favorites/trips?tripCode=${encodeURIComponent(id)}`, {
            method: 'DELETE',
          })
          if (res.ok) removeTrip(id)
        } else {
          const res = await fetch('/api/favorites/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripCode: id,
              lineName: trip.lineName ?? null,
            }),
          })
          if (res.ok) {
            addTrip({
              id: '',
              user_id: user!.id,
              trip_code: id,
              line_name: trip.lineName ?? null,
              origin_id: null,
              dest_id: null,
              schedule: null,
              created_at: new Date().toISOString(),
            })
          }
        }
      }
    } catch {
      // silent
    } finally {
      setBtnLoading(false)
    }
  }, [user, id, isStation, isFav, props, addStation, removeStation, addTrip, removeTrip])

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition',
          'hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber',
          loading && 'opacity-50',
          props.className
        )}
        aria-label={
          isFav
            ? isStation
              ? t('removeStation')
              : t('removeTrip')
            : isStation
              ? t('addStation')
              : t('addTrip')
        }
      >
        {loading ? (
          <Spinner size="sm" />
        ) : (
          <Star
            className={cn(
              'h-4 w-4',
              isFav ? 'fill-rail-amber text-rail-amber' : 'text-rail-cream/50'
            )}
          />
        )}
      </button>

      <AuthRequiredModal
        open={showAuth}
        onOpenChange={setShowAuth}
        title={t('authRequired')}
        description={props.name ? t('authRequiredDescription', { name: props.name }) : undefined}
      />
    </>
  )
}
