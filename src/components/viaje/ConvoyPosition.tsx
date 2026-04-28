'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { Train } from 'lucide-react'
import type { Parada, PosicionTren } from '@/lib/renfe/types'

interface ConvoyPositionProps {
  posicion: PosicionTren
  paradas: Parada[]
}

export function ConvoyPosition({ posicion, paradas }: ConvoyPositionProps) {
  const t = useTranslations('viaje')

  const stopIdx = paradas.findIndex((p) => p.stopId === posicion.stopId)
  const currentStop = paradas[stopIdx]

  let label: string
  if (stopIdx === -1 || !currentStop) {
    label = t('noPositionInfo')
  } else if (!posicion.enMovimiento) {
    label = posicion.anden
      ? t('stoppedAtPlatform', { station: currentStop.nombre || currentStop.stopId, platform: posicion.anden })
      : t('stoppedAt', { station: currentStop.nombre || currentStop.stopId })
  } else {
    const prevStop = paradas[stopIdx - 1]
    if (prevStop) {
      label = t('inTransitBetween', {
        from: prevStop.nombre || prevStop.stopId,
        to: currentStop.nombre || currentStop.stopId,
      })
    } else {
      label = t('stoppedAt', { station: currentStop.nombre || currentStop.stopId })
    }
  }

  return (
    <div className="mx-4 my-3 flex items-center gap-3 rounded-2xl bg-rail-amber/10 px-4 py-3 ring-1 ring-rail-amber/20">
      <motion.span
        animate={
          posicion.enMovimiento
            ? { x: [0, 4, 0] }
            : { scale: [1, 1.15, 1] }
        }
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="shrink-0 text-rail-amber"
      >
        <Train className="h-5 w-5" />
      </motion.span>
      <p className="text-sm font-medium text-rail-amber/90">{label}</p>
    </div>
  )
}
