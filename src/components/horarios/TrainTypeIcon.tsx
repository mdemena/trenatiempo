import type { TipoServicio } from '@/lib/renfe/types'
import { cn } from '@/lib/utils'
import { Train, TrainTrack } from 'lucide-react'

interface TrainTypeIconProps {
  tipo: TipoServicio
}

export function TrainTypeIcon({ tipo }: TrainTypeIconProps) {
  if (tipo === 'cercanias') {
    return (
      <span className="flex items-center justify-center gap-0.5 text-[10px] font-medium text-rail-cream/55 light:text-rail-dark/55">
        <Train className="h-3 w-3" />
      </span>
    )
  }

  // MD / Regional
  return (
    <span className="flex items-center justify-center gap-0.5 text-[10px] text-rail-amber/60 light:text-rail-amber">
      <TrainTrack className="h-3 w-3" />
    </span>
  )
}
