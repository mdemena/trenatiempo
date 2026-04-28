'use client'

import { useState, useCallback } from 'react'

export type GeolocationErrorCode =
  | 'not_supported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'

export interface GeolocationState {
  loading: boolean
  errorCode: GeolocationErrorCode | null
  coords: { lat: number; lng: number } | null
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    loading: false,
    errorCode: null,
    coords: null,
  })

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ loading: false, errorCode: 'not_supported', coords: null })
      return
    }

    setState({ loading: true, errorCode: null, coords: null })

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          loading: false,
          errorCode: null,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      (err) => {
        const errorCode: GeolocationErrorCode =
          err.code === 1
            ? 'permission_denied'
            : err.code === 2
              ? 'position_unavailable'
              : 'timeout'
        setState({ loading: false, errorCode, coords: null })
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  return { ...state, getLocation }
}
