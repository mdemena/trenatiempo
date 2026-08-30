'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useHorarios } from '@/hooks/useHorarios'
import { FilterBar } from '@/components/horarios/FilterBar'
import { TrainList } from '@/components/horarios/TrainList'
import { DatePicker } from '@/components/ui/DatePicker'
import { FavoriteButton } from '@/components/favorites/FavoriteButton'
import { todayISO, isISODate } from '@/lib/utils/dates'
import type { TipoFiltro } from '@/hooks/useHorarios'
import type { Estacion } from '@/lib/renfe/types'

interface EstacionClientProps {
  station: Estacion
  /** Última fecha con horarios disponibles (cobertura GTFS) para limitar el calendario */
  maxFecha?: string | null
}

export function EstacionClient({ station, maxFecha }: EstacionClientProps) {
  const t = useTranslations('common')
  const searchParams = useSearchParams()
  const [tipo, setTipo] = useState<TipoFiltro>('all')

  // Fecha desde la URL; solo se acepta hoy o futuro
  const fechaParam = searchParams.get('fecha')
  const fecha =
    fechaParam && isISODate(fechaParam) && fechaParam >= todayISO() ? fechaParam : null

  const { trenes, loading, error, stale, updatedAt, refresh } = useHorarios(
    station.id,
    tipo,
    fecha
  )

  function handleFechaChange(iso: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (iso) {
      params.set('fecha', iso)
    } else {
      params.delete('fecha')
    }
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Fixed header — back + station name + date */}
      <header className="flex shrink-0 items-center gap-3 border-b border-rail-border bg-rail-navy/95 px-4 py-3">
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
          aria-label={t('back')}
        >
          <ArrowLeft className="h-5 w-5 text-rail-cream/70" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-rail-amber/60">
            TrenATiempo
          </p>
          <h1 className="truncate font-display text-lg font-bold text-rail-cream">
            {station.name}
          </h1>
        </div>

        <DatePicker
          value={fecha}
          onChange={handleFechaChange}
          maxIso={maxFecha ?? undefined}
          compact
          className="shrink-0"
        />

        <FavoriteButton
          type="station"
          id={station.id}
          name={station.name}
          station={station}
          className="shrink-0"
        />
      </header>

      {/* Filters + train list */}
      <FilterBar value={tipo} onChange={setTipo} />
      <div className="flex-1 overflow-y-auto">
        <TrainList
          trenes={trenes}
          loading={loading}
          error={error}
          stale={stale}
          updatedAt={updatedAt}
          onRetry={refresh}
          stopId={station.id}
          fecha={fecha}
        />
      </div>
    </div>
  )
}