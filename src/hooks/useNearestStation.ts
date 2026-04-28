'use client'

import { useState, useEffect } from 'react'
import type { Estacion } from '@/types/renfe'

export function useNearestStation(coords: {
  lat: number
  lng: number
} | null) {
  const [stations, setStations] = useState<
    (Estacion & { distanciaKm: number })[]
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!coords) return

    setLoading(true)
    setError(null)

    fetch(`/api/renfe/estaciones?lat=${coords.lat}&lng=${coords.lng}`)
      .then((r) => r.json())
      .then((data) => setStations(data.estaciones ?? []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [coords])

  return { stations, loading, error }
}
