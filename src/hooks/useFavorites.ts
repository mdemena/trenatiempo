'use client'

import { useEffect, useRef } from 'react'
import { useUserStore } from '@/store/userStore'
import { useFavoritesStore } from '@/store/favoritesStore'

export function useLoadFavorites() {
  const user = useUserStore((s) => s.user)
  const { loaded, loading, setStations, setTrips, setLoading, reset } = useFavoritesStore()
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user) {
      fetchedRef.current = null
      reset()
      return
    }
    if (loaded || loading) return
    if (fetchedRef.current === user.id) return
    fetchedRef.current = user.id

    setLoading(true)

    Promise.all([
      fetch('/api/favorites/stations').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/favorites/trips').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([stations, trips]) => {
        if (stations?.stations) setStations(stations.stations)
        if (trips?.favorites) setTrips(trips.favorites)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
}
