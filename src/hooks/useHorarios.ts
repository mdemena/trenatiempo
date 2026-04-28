'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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

export function useHorarios(stopId: string | null, tipo: TipoFiltro = 'cercanias') {
  const [state, setState] = useState<HorariosState>({
    trenes: [],
    updatedAt: null,
    loading: false,
    error: false,
    stale: false,
  })
  const prevTrenes = useRef<HorarioEntry[]>([])

  const load = useCallback(async () => {
    if (!stopId) return
    setState((s) => ({ ...s, loading: true, error: false }))

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
          ok.push(...cerRes.value.horarios.map((h) => ({ ...h, tipo: 'cercanias' as const })))
          latestAt = Math.max(latestAt, cerRes.value.updatedAt)
          isStale = isStale || cerRes.value.stale
        }
        if (mdRes.status === 'fulfilled') {
          ok.push(...mdRes.value.horarios.map((h) => ({ ...h, tipo: 'md' as const })))
          latestAt = Math.max(latestAt, mdRes.value.updatedAt)
          isStale = isStale || mdRes.value.stale
        }
        if (ok.length === 0 && cerRes.status === 'rejected' && mdRes.status === 'rejected') {
          throw new Error('All feeds failed')
        }

        merged = ok.sort((a, b) => a.salidaProgramada.localeCompare(b.salidaProgramada))
        updatedAt = latestAt
        stale = isStale
      } else {
        const data = await apiFetch(stopId, tipo)
        merged = data.horarios.map((h) => ({ ...h, tipo }))
        updatedAt = data.updatedAt
        stale = data.stale
      }

      const trenes = filterFuture(merged)
      prevTrenes.current = trenes
      setState({ trenes, updatedAt, loading: false, error: false, stale })
    } catch {
      setState((s) => ({
        ...s,
        trenes: prevTrenes.current,
        loading: false,
        error: true,
        stale: true,
      }))
    }
  }, [stopId, tipo])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), INTERVAL_MS[tipo])
    return () => clearInterval(id)
  }, [load, tipo])

  return { ...state, refresh: load }
}
