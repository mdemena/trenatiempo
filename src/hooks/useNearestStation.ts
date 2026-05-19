'use client'

import { useEffect, useCallback, useReducer } from 'react'
import { useGeolocation, type GeolocationErrorCode } from './useGeolocation'
import type { EstacionConDistancia } from '@/lib/renfe/types'

type FetchAction =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; stations: EstacionConDistancia[] }
  | { type: 'ERROR' }

type FetchState = {
  loading: boolean
  error: boolean
  stations: EstacionConDistancia[]
}

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'LOADING':
      return { loading: true, error: false, stations: [] }
    case 'SUCCESS':
      return { loading: false, error: false, stations: action.stations }
    case 'ERROR':
      return { loading: false, error: true, stations: [] }
  }
}

const initialState: FetchState = { loading: false, error: false, stations: [] }

export function useNearestStation() {
  const { loading: geoLoading, errorCode: geoError, coords, getLocation } = useGeolocation()
  const [fetchState, dispatch] = useReducer(fetchReducer, initialState)

  useEffect(() => {
    if (!coords) return

    dispatch({ type: 'LOADING' })

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
        dispatch({ type: 'SUCCESS', stations: data.estaciones ?? [] })
      )
      .catch(() => dispatch({ type: 'ERROR' }))
  }, [coords])

  const trigger = useCallback(() => {
    dispatch({ type: 'LOADING' })
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
