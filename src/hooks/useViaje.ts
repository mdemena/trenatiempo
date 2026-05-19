'use client'

import { useReducer, useEffect, useCallback, useRef } from 'react'
import type { Tren, ViajeResponse } from '@/lib/renfe/types'

interface ViajeState {
  tren: Tren | null
  loading: boolean
  error: boolean
  stale: boolean
  updatedAt: number | null
}

type ViajeAction =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; tren: Tren; updatedAt: number; stale: boolean }
  | { type: 'ERROR'; tren: Tren | null }

function viajeReducer(state: ViajeState, action: ViajeAction): ViajeState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: false }
    case 'SUCCESS':
      return {
        tren: action.tren,
        loading: false,
        error: false,
        stale: action.stale,
        updatedAt: action.updatedAt,
      }
    case 'ERROR':
      return { ...state, tren: action.tren, loading: false, error: true, stale: true }
  }
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

const initialState: ViajeState = {
  tren: null,
  loading: false,
  error: false,
  stale: false,
  updatedAt: null,
}

export function useViaje(tripId: string | null) {
  const [state, dispatch] = useReducer(viajeReducer, initialState)
  const prevTren = useRef<Tren | null>(null)

  const load = useCallback(async () => {
    if (!tripId) return
    dispatch({ type: 'LOADING' })
    try {
      const data = await apiFetch(tripId)
      prevTren.current = data.tren
      dispatch({
        type: 'SUCCESS',
        tren: data.tren,
        updatedAt: data.updatedAt,
        stale: data.stale,
      })
    } catch {
      dispatch({ type: 'ERROR', tren: prevTren.current })
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
