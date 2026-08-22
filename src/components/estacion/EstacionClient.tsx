'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useHorarios } from '@/hooks/useHorarios'
import { FilterBar } from '@/components/horarios/FilterBar'
import { TrainList } from '@/components/horarios/TrainList'
import { DatePicker } from '@/components/ui/DatePicker'
import { todayISO, isISODate } from '@/lib/utils/dates'
import type { TipoFiltro } from '@/hooks/useHorarios'

interface EstacionClientProps {
  stopId: string
  /** Última fecha con horarios disponibles (cobertura GTFS) para limitar el calendario */
  maxFecha?: string | null
}

export function EstacionClient({ stopId, maxFecha }: EstacionClientProps) {
  const t = useTranslations('datePicker')
  const searchParams = useSearchParams()
  const [tipo, setTipo] = useState<TipoFiltro>('all')

  // Fecha desde la URL; solo se acepta hoy o futuro
  const fechaParam = searchParams.get('fecha')
  const fecha =
    fechaParam && isISODate(fechaParam) && fechaParam >= todayISO() ? fechaParam : null

  const { trenes, loading, error, stale, updatedAt, refresh } = useHorarios(
    stopId,
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
      <div className="space-y-3 pb-1">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-rail-cream/35">
            {t('label')}
          </label>
          <DatePicker value={fecha} onChange={handleFechaChange} maxIso={maxFecha ?? undefined} />
        </div>
        <FilterBar value={tipo} onChange={setTipo} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <TrainList
          trenes={trenes}
          loading={loading}
          error={error}
          stale={stale}
          updatedAt={updatedAt}
          onRetry={refresh}
          stopId={stopId}
          fecha={fecha}
        />
      </div>
    </div>
  )
}
