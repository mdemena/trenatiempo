'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database'

type Station = Database['public']['Tables']['stations']['Row']

interface HorarioRow {
  tripId: string
  routeId: string | null
  tipo: 'cercanias' | 'md'
  salidaProgramada: string
  destino: string | null
}

interface DetailResponse {
  station: Station
  horarios: HorarioRow[]
  total: number
  totalPages: number
  page: number
  pageSize: number
  fecha: string
  tipo: string
}

const TYPE_LABELS: Record<string, string> = {
  cercanias: 'C',
  md: 'MD',
  ave: 'AVE',
  regional: 'Reg',
  ld: 'LD',
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function buildDays(count = 7): { date: string; label: string; day: string }[] {
  const days: { date: string; label: string; day: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    days.push({
      date: d.toISOString().slice(0, 10),
      label: i === 0 ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
      day: DAY_NAMES[d.getDay()],
    })
  }
  return days
}

export function StationDetail({ stationId }: { stationId: string }) {
  const router = useRouter()
  const [station, setStation] = useState<Station | null>(null)
  const [horarios, setHorarios] = useState<HorarioRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [fecha, setFecha] = useState<string>(buildDays(1)[0].date)
  const [tipo, setTipo] = useState<'all' | 'cercanias' | 'md'>('all')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/estaciones/${stationId}?fecha=${fecha}&tipo=${tipo}&page=${page}`
      )
      if (res.status === 404) {
        setNotFound(true)
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error('Error loading station')
      const json: DetailResponse = await res.json()
      setStation(json.station)
      setHorarios(json.horarios)
      setTotal(json.total)
      setTotalPages(json.totalPages)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [stationId, fecha, tipo, page])

  useEffect(() => {
    const id = setTimeout(() => load(), 0)
    return () => clearTimeout(id)
  }, [load])

  const days = buildDays()

  const handleDayChange = (date: string) => {
    setFecha(date)
    setPage(1)
  }

  const handleTipoChange = (value: string) => {
    setTipo(value as typeof tipo)
    setPage(1)
  }

  if (notFound) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-xl font-bold text-rail-cream">Estación no encontrada</p>
        <button
          onClick={() => router.push('/admin/estaciones')}
          className="mt-4 rounded-xl border border-rail-border px-4 py-2 text-sm text-rail-cream/70 transition hover:bg-rail-surface"
        >
          Volver al listado
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Back */}
      <div className="mb-5">
        <button
          onClick={() => router.push('/admin/estaciones')}
          className="mb-4 flex items-center gap-1 text-sm text-rail-cream/50 transition hover:text-rail-cream"
        >
          <ChevronLeft className="h-4 w-4" />
          Estaciones
        </button>

        {/* Station header */}
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-rail-border bg-rail-surface/40 p-5">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-rail-cream">
              {station?.name ?? '…'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-rail-cream/50">
              <span className="rounded-md bg-rail-surface/70 px-2 py-0.5 font-mono">{station?.id}</span>
              {station?.province && (
                <span className="rounded-md bg-rail-surface/70 px-2 py-0.5">{station.province}</span>
              )}
              {station?.municipality && (
                <span className="rounded-md bg-rail-surface/70 px-2 py-0.5">{station.municipality}</span>
              )}
              {(station?.types ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-rail-amber/10 px-2 py-0.5 font-medium text-rail-amber/80"
                >
                  {TYPE_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Day tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.date}
            onClick={() => handleDayChange(d.date)}
            className={`flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition ${
              fecha === d.date
                ? 'border-rail-amber/40 bg-rail-amber/15 text-rail-amber'
                : 'border-rail-border text-rail-cream/60 hover:bg-rail-surface'
            }`}
          >
            <span className="text-xs font-semibold">{d.label}</span>
            <span className={`text-[10px] uppercase tracking-wide ${fecha === d.date ? 'text-rail-amber/70' : 'text-rail-cream/35'}`}>
              {d.day}
            </span>
          </button>
        ))}
      </div>

      {/* Tipo filter */}
      <div className="mb-4">
        <select
          value={tipo}
          onChange={(e) => handleTipoChange(e.target.value)}
          className="rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        >
          <option value="all" className="bg-rail-navy">Todos los servicios</option>
          <option value="cercanias" className="bg-rail-navy">Cercanías</option>
          <option value="md" className="bg-rail-navy">Media Distancia</option>
        </select>
      </div>

      {/* Horarios */}
      <div className="overflow-x-auto rounded-2xl border border-rail-border bg-rail-surface/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rail-border text-xs font-medium uppercase tracking-widest text-rail-cream/40">
              <th className="px-4 py-3 text-left">Hora</th>
              <th className="px-4 py-3 text-left">Tren</th>
              <th className="px-4 py-3 text-left">Destino</th>
              <th className="px-4 py-3 text-left">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-rail-border border-t-rail-amber" />
                </td>
              </tr>
            )}
            {!loading && horarios.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-rail-cream/40">
                  Sin horarios para este día
                </td>
              </tr>
            )}
            {!loading &&
              horarios.map((h) => (
                <tr key={h.tripId} className="border-b border-rail-border/60 last:border-0 hover:bg-rail-surface/60">
                  <td className="px-4 py-3 font-mono text-base font-semibold text-rail-cream">
                    {h.salidaProgramada}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-rail-amber/10 px-1.5 py-0.5 font-mono text-xs text-rail-amber">
                      {h.routeId ?? h.tripId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-rail-cream/70">{h.destino ?? '–'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        h.tipo === 'md'
                          ? 'bg-rail-surface text-rail-cream/60'
                          : 'bg-rail-amber/15 text-rail-amber'
                      }`}
                    >
                      {h.tipo === 'md' ? 'MD' : 'Cercanías'}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-rail-cream/50">
          <p>
            {total} salidas · página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-rail-border p-1.5 transition hover:bg-rail-surface disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-rail-border p-1.5 transition hover:bg-rail-surface disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}