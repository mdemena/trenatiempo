'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Tren, ViajeResponse } from '@/lib/renfe/types'

interface ViajeState {
  tren: Tren | null
  loading: boolean
  error: boolean
  stale: boolean
  updatedAt: number | null
}

function isTripFinished(tren: Tren): boolean {
  if (tren.estado === 'cancelado') return true
  const last = tren.paradas[tren.paradas.length - 1]
  if (!last) return false
  const finalTs = last.llegadaReal ?? last.llegadaProgramada
  return !!finalTs && finalTs * 1000 < Date.now()
}

async function apiFetch(tripId: string): Promise<ViajeResponse> {
  const res = await fetch(`/api/renfe/viaje/${encodeURIComponent(tripId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ViajeResponse>
}

export function useViaje(tripId: string | null) {
  const [state, setState] = useState<ViajeState>({
    tren: null,
    loading: false,
    error: false,
    stale: false,
    updatedAt: null,
  })
  const prevTren = useRef<Tren | null>(null)

  const load = useCallback(async () => {
    if (!tripId) return
    setState((s) => ({ ...s, loading: true, error: false }))
    try {
      const data = await apiFetch(tripId)
      prevTren.current = data.tren
      setState({
        tren: data.tren,
        loading: false,
        error: false,
        stale: data.stale,
        updatedAt: data.updatedAt,
      })
    } catch {
      setState((s) => ({
        ...s,
        tren: prevTren.current,
        loading: false,
        error: true,
        stale: true,
      }))
    }
  }, [tripId])

  useEffect(() => {
    void load()
    const id = setInterval(() => {
      if (prevTren.current && isTripFinished(prevTren.current)) {
        clearInterval(id)
        return
      }
      void load()
    }, 20_000)
    return () => clearInterval(id)
  }, [load])

  return { ...state, refresh: load }
}
