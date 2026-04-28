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
    <>
      <FilterBar value={tipo} onChange={setTipo} />
      <TrainList
        trenes={trenes}
        loading={loading}
        error={error}
        stale={stale}
        updatedAt={updatedAt}
        onRetry={refresh}
      />
    </>
  )
}
