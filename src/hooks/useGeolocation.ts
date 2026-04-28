'use client'

import { useState, useCallback } from 'react'

interface GeolocationState {
  loading: boolean
  error: string | null
  coords: { lat: number; lng: number } | null
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    loading: false,
    error: null,
    coords: null,
  })

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocalización no soportada' }))
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          loading: false,
          error: null,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      (err) =>
        setState({ loading: false, error: err.message, coords: null }),
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  return { ...state, getLocation }
}
