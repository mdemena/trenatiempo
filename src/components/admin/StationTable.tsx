'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Search, TrainFront } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database'

type Station = Database['public']['Tables']['stations']['Row']

interface StationResponse {
  estaciones: Station[]
  total: number
  totalPages: number
  page: number
  filter: { provinces: string[]; municipalities: string[]; types: string[] }
}

const TYPE_LABELS: Record<string, string> = {
  cercanias: 'C',
  md: 'MD',
  ave: 'AVE',
  regional: 'Reg',
  ld: 'LD',
}

const SERVICE_LABELS: Record<string, string> = {
  cercanias: 'Cercanías',
  md: 'Media Distancia',
  ave: 'AVE',
  regional: 'Regional',
  ld: 'Larga Distancia',
}

export function StationTable() {
  const router = useRouter()
  const [stations, setStations] = useState<Station[]>([])
  const [provinces, setProvinces] = useState<string[]>([])
  const [municipalities, setMunicipalities] = useState<string[]>([])
  const [filterTypes, setFilterTypes] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [province, setProvince] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [tipo, setTipo] = useState('')
  const [loading, setLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStations = useCallback(
    async (params: {
      page: number
      search: string
      province: string
      municipality: string
      tipo: string
    }) => {
      setLoading(true)
      try {
        const q = new URLSearchParams({
          page: String(params.page),
        })
        if (params.search) q.set('q', params.search)
        if (params.province) q.set('province', params.province)
        if (params.municipality) q.set('municipality', params.municipality)
        if (params.tipo) q.set('tipo', params.tipo)

        const res = await fetch(`/api/admin/estaciones?${q}`)
        if (!res.ok) throw new Error('Error fetching stations')
        const json: StationResponse = await res.json()
        setStations(json.estaciones)
        setProvinces(json.filter.provinces)
        setMunicipalities(json.filter.municipalities)
        setFilterTypes(json.filter.types)
        setTotal(json.total)
        setTotalPages(json.totalPages)
      } catch {
        setStations([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchStations({ page, search, province, municipality, tipo })
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [page, search, province, municipality, tipo, fetchStations])

  // Reset municipality when province changes
  const handleProvinceChange = (value: string) => {
    setProvince(value)
    setMunicipality('')
    setPage(1)
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rail-cream/30" />
          <input
            type="search"
            placeholder="Buscar por nombre, código o localidad..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full rounded-xl border border-rail-border bg-rail-surface/40 py-2 pl-9 pr-3 text-sm text-rail-cream placeholder:text-rail-cream/30 focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
          />
        </div>

        <select
          value={province}
          onChange={(e) => handleProvinceChange(e.target.value)}
          className="rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        >
          <option value="" className="bg-rail-navy">Todas las provincias</option>
          {provinces.map((p) => (
            <option key={p} value={p} className="bg-rail-navy">{p}</option>
          ))}
        </select>

        <select
          value={municipality}
          onChange={(e) => {
            setMunicipality(e.target.value)
            setPage(1)
          }}
          className="rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        >
          <option value="" className="bg-rail-navy">
            {province ? 'Todas las localidades' : 'Empieza por provincia'}
          </option>
          {municipalities.map((m) => (
            <option key={m} value={m} className="bg-rail-navy">{m}</option>
          ))}
        </select>

        <select
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value)
            setPage(1)
          }}
          className="rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        >
          <option value="" className="bg-rail-navy">Todos los servicios</option>
          {filterTypes.map((t) => (
            <option key={t} value={t} className="bg-rail-navy">
              {SERVICE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-rail-border bg-rail-surface/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rail-border text-xs font-medium uppercase tracking-widest text-rail-cream/40">
              <th className="px-4 py-3 text-left">Estación</th>
              <th className="hidden px-4 py-3 text-left md:table-cell">Código</th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">Provincia</th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">Localidad</th>
              <th className="px-4 py-3 text-left">Servicios</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-rail-border border-t-rail-amber" />
                </td>
              </tr>
            )}
            {!loading && stations.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-rail-cream/40">
                  Sin estaciones
                </td>
              </tr>
            )}
            {!loading &&
              stations.map((station) => (
                <tr
                  key={station.id}
                  onClick={() => router.push(`/admin/estaciones/${station.id}`)}
                  className="cursor-pointer border-b border-rail-border/60 last:border-0 hover:bg-rail-surface/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rail-amber/10 text-rail-amber">
                        <TrainFront className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-rail-cream">
                          {station.name}
                        </p>
                        {station.short_name && (
                          <p className="truncate text-xs text-rail-cream/40">{station.short_name}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-rail-cream/50 md:table-cell">
                    {station.id}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-rail-cream/50 lg:table-cell">
                    {station.province ?? '–'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-rail-cream/50 lg:table-cell">
                    {station.municipality ?? '–'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(station.types ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-rail-surface/70 px-1.5 py-0.5 text-[10px] font-medium text-rail-amber/80"
                        >
                          {TYPE_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
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
            {total} estaciones · página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-rail-border p-1.5 transition hover:bg-rail-surface disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i
              if (p < 1 || p > totalPages) return null
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-xs transition ${
                    p === page
                      ? 'border-rail-amber/40 bg-rail-amber/15 font-semibold text-rail-amber'
                      : 'border-rail-border hover:bg-rail-surface'
                  }`}
                >
                  {p}
                </button>
              )
            })}
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