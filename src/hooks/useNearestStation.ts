'use client'

import { useState, useEffect, useCallback } from 'react'
import { useGeolocation, type GeolocationErrorCode } from './useGeolocation'
import type { EstacionConDistancia } from '@/lib/renfe/types'

interface FetchState {
  loading: boolean
  error: boolean
  stations: EstacionConDistancia[]
}

export function useNearestStation() {
  const { loading: geoLoading, errorCode: geoError, coords, getLocation } = useGeolocation()
  const [fetchState, setFetchState] = useState<FetchState>({
    loading: false,
    error: false,
    stations: [],
  })

  useEffect(() => {
    if (!coords) return

    setFetchState({ loading: true, error: false, stations: [] })

    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      limit: '8',
    })

    fetch(`/api/renfe/estaciones/cercanas?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error('fetch error')
        return res.json() as Promise<{ estaciones?: EstacionConDistancia[] }>
      })
      .then((data) =>
        setFetchState({ loading: false, error: false, stations: data.estaciones ?? [] })
      )
      .catch(() => setFetchState({ loading: false, error: true, stations: [] }))
  }, [coords])

  const trigger = useCallback(() => {
    setFetchState({ loading: false, error: false, stations: [] })
    getLocation()
  }, [getLocation])

  return {
    loading: geoLoading || fetchState.loading,
    geoError: geoError as GeolocationErrorCode | null,
    fetchError: fetchState.error,
    stations: fetchState.stations,
    trigger,
  }
}
