'use client'

import { useState, useEffect, useCallback } from 'react'

interface HorarioEntry {
  tripId: string
  salidaProgramada: string
  salidaReal: string
  delaySeg: number
  cancelado: boolean
}

interface HorariosState {
  horarios: HorarioEntry[]
  updatedAt: number | null
  loading: boolean
  error: string | null
  stale: boolean
}

export function useHorarios(
  stopId: string | null,
  tipo: 'cercanias' | 'md' = 'cercanias',
  intervalMs = 20000
) {
  const [state, setState] = useState<HorariosState>({
    horarios: [],
    updatedAt: null,
    loading: false,
    error: null,
    stale: false,
  })

  const fetch_ = useCallback(async () => {
    if (!stopId) return
    setState((s) => ({ ...s, loading: true }))
    try {
      const res = await fetch(
        `/api/renfe/horarios?stopId=${stopId}&tipo=${tipo}`
      )
      const data = await res.json()
      setState({
        horarios: data.horarios ?? [],
        updatedAt: data.updatedAt ?? Date.now(),
        loading: false,
        error: null,
        stale: !!data.stale,
      })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as Error).message,
        stale: true,
      }))
    }
  }, [stopId, tipo])

  useEffect(() => {
    void fetch_()
    const id = setInterval(() => void fetch_(), intervalMs)
    return () => clearInterval(id)
  }, [fetch_, intervalMs])

  return { ...state, refresh: fetch_ }
}
