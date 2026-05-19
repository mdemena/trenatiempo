'use client'

import { useReducer, useEffect, useCallback, useRef } from 'react'
import type { HorarioEntry, HorariosResponse } from '@/lib/renfe/types'

export type TipoFiltro = 'cercanias' | 'md' | 'all'

interface HorariosState {
  trenes: HorarioEntry[]
  updatedAt: number | null
  loading: boolean
  error: boolean
  stale: boolean
}

const INTERVAL_MS: Record<TipoFiltro, number> = {
  cercanias: 20_000,
  md: 30_000,
  all: 20_000,
}

type HorariosAction =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; trenes: HorarioEntry[]; updatedAt: number; stale: boolean }
  | { type: 'ERROR'; trenes: HorarioEntry[] }

function horariosReducer(state: HorariosState, action: HorariosAction): HorariosState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: false }
    case 'SUCCESS':
      return {
        trenes: action.trenes,
        updatedAt: action.updatedAt,
        loading: false,
        error: false,
        stale: action.stale,
      }
    case 'ERROR':
      return { ...state, trenes: action.trenes, loading: false, error: true, stale: true }
  }
}

function gtfsTimeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)
}

function filterFuture(trenes: HorarioEntry[]): HorarioEntry[] {
  const now = new Date()
  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  return trenes.filter(
    (t) => gtfsTimeToSeconds(t.salidaReal ?? t.salidaProgramada) >= nowSecs
  )
}

async function apiFetch(stopId: string, tipo: 'cercanias' | 'md'): Promise<HorariosResponse> {
  const res = await fetch(`/api/renfe/horarios?stopId=${stopId}&tipo=${tipo}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<HorariosResponse>
}

const initialState: HorariosState = {
  trenes: [],
  updatedAt: null,
  loading: false,
  error: false,
  stale: false,
}

export function useHorarios(stopId: string | null, tipo: TipoFiltro = 'cercanias') {
  const [state, dispatch] = useReducer(horariosReducer, initialState)
  const prevTrenes = useRef<HorarioEntry[]>([])

  const load = useCallback(async () => {
    if (!stopId) return
    dispatch({ type: 'LOADING' })

    try {
      let merged: HorarioEntry[]
      let updatedAt: number
      let stale: boolean

      if (tipo === 'all') {
        const [cerRes, mdRes] = await Promise.allSettled([
          apiFetch(stopId, 'cercanias'),
          apiFetch(stopId, 'md'),
        ])

        const ok: HorarioEntry[] = []
        let latestAt = Date.now()
        let isStale = false

        if (cerRes.status === 'fulfilled') {
          ok.push(...cerRes.value.horarios)
          latestAt = Math.max(latestAt, cerRes.value.updatedAt)
          isStale = isStale || cerRes.value.stale
        }
        if (mdRes.status === 'fulfilled') {
          ok.push(...mdRes.value.horarios)
          latestAt = Math.max(latestAt, mdRes.value.updatedAt)
          isStale = isStale || mdRes.value.stale
        }
        if (ok.length === 0 && cerRes.status === 'rejected' && mdRes.status === 'rejected') {
          throw new Error('All feeds failed')
        }

        const seenTripIds = new Set<string>()
        const seenComposite = new Set<string>()
        merged = ok
          .sort((a, b) => a.salidaProgramada.localeCompare(b.salidaProgramada))
          .filter((t) => {
            if (seenTripIds.has(t.tripId)) return false
            seenTripIds.add(t.tripId)
            const compositeKey = t.destino
              ? `${t.salidaProgramada}:${t.destino}`
              : `${t.salidaProgramada}:${t.routeId}`
            if (seenComposite.has(compositeKey)) return false
            seenComposite.add(compositeKey)
            return true
          })
        updatedAt = latestAt
        stale = isStale
      } else {
        const data = await apiFetch(stopId, tipo)
        merged = data.horarios
        updatedAt = data.updatedAt
        stale = data.stale
      }

      const trenes = filterFuture(merged)
      prevTrenes.current = trenes
      dispatch({ type: 'SUCCESS', trenes, updatedAt, stale })
    } catch {
      dispatch({ type: 'ERROR', trenes: prevTrenes.current })
    }
  }, [stopId, tipo])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), INTERVAL_MS[tipo])
    return () => clearInterval(id)
  }, [load, tipo])

  return { ...state, refresh: load }
}
