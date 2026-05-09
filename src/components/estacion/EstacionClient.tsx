'use client'

import { useState } from 'react'
import { useHorarios } from '@/hooks/useHorarios'
import { FilterBar } from '@/components/horarios/FilterBar'
import { TrainList } from '@/components/horarios/TrainList'
import type { TipoFiltro } from '@/hooks/useHorarios'

interface EstacionClientProps {
  stopId: string
}

export function EstacionClient({ stopId }: EstacionClientProps) {
  const [tipo, setTipo] = useState<TipoFiltro>('all')
  const { trenes, loading, error, stale, updatedAt, refresh } = useHorarios(stopId, tipo)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar value={tipo} onChange={setTipo} />
      <div className="flex-1 overflow-y-auto">
        <TrainList
          trenes={trenes}
          loading={loading}
          error={error}
          stale={stale}
          updatedAt={updatedAt}
          onRetry={refresh}
          stopId={stopId}
        />
      </div>
    </div>
  )
}
