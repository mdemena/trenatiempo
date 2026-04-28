'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Parada, PosicionTren } from '@/lib/renfe/types'

// ─── Stop state logic ─────────────────────────────────────────────────────────

type ParadaEstado = 'pasada' | 'actual' | 'futura'

function getParadaEstado(
  idx: number,
  allParadas: Parada[],
  posicionActual?: PosicionTren
): ParadaEstado {
  if (posicionActual?.stopId) {
    const convoyIdx = allParadas.findIndex((p) => p.stopId === posicionActual.stopId)
    if (convoyIdx !== -1) {
      if (posicionActual.enMovimiento) {
        // IN_TRANSIT_TO: all before convoy's next stop are passed
        return idx < convoyIdx ? 'pasada' : 'futura'
      }
      // STOPPED_AT
      if (idx < convoyIdx) return 'pasada'
      if (idx === convoyIdx) return 'actual'
      return 'futura'
    }
  }
  // Fallback: time-based — if departure passed it's done
  const p = allParadas[idx]
  if (!p) return 'futura'
  const dep = p.salidaReal ?? p.salidaProgramada
  if (dep && dep * 1000 < Date.now()) return 'pasada'
  return 'futura'
}

// ─── Single stop row ─────────────────────────────────────────────────────────

interface StopRowProps {
  parada: Parada
  absoluteIdx: number
  allParadas: Parada[]
  posicionActual?: PosicionTren
  isLast: boolean
  locale: string
}

function StopRow({ parada, absoluteIdx, allParadas, posicionActual, isLast, locale }: StopRowProps) {
  const estado = getParadaEstado(absoluteIdx, allParadas, posicionActual)
  const delayMin = Math.round((parada.delaySeg ?? 0) / 60)
  const hasDelay = delayMin > 1

  const scheduledTs = parada.esDestino
    ? parada.llegadaProgramada
    : parada.salidaProgramada
  const realTs = parada.esDestino ? parada.llegadaReal : parada.salidaReal

  const scheduledTime = scheduledTs ? formatTime(scheduledTs, locale) : null
  const realTime = realTs ? formatTime(realTs, locale) : null

  const isTerminus = parada.esOrigen || parada.esDestino

  return (
    <div
      data-testid={`stop-${parada.stopId}`}
      data-estado={estado}
      id={`stop-${parada.stopId}`}
      className={cn('relative flex items-start gap-4', !isLast && 'pb-5')}
    >
      {/* Timeline column */}
      <div className="relative flex w-4 flex-col items-center">
        {estado === 'actual' ? (
          <motion.span
            animate={
              estado === 'actual'
                ? { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }
                : {}
            }
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative z-10 h-3.5 w-3.5 rounded-full bg-rail-amber"
            data-pulse="true"
          />
        ) : (
          <span
            className={cn(
              'relative z-10 rounded-full border-2',
              isTerminus ? 'h-4 w-4' : 'h-3 w-3',
              estado === 'pasada'
                ? 'border-rail-cream/25 bg-rail-cream/25'
                : 'border-rail-cream/50 bg-transparent'
            )}
          />
        )}
        {!isLast && (
          <div
            className={cn(
              'mt-1.5 w-0.5 flex-1',
              estado === 'pasada' ? 'bg-rail-cream/10' : 'bg-rail-cream/20'
            )}
            style={{ minHeight: '1.25rem' }}
          />
        )}
      </div>

      {/* Stop info */}
      <div className="min-w-0 flex-1 pb-1">
        <span
          className={cn(
            'block truncate font-medium',
            isTerminus ? 'text-sm' : 'text-[13px]',
            estado === 'actual'
              ? 'text-rail-amber'
              : estado === 'pasada'
                ? 'text-rail-cream/35'
                : 'text-rail-cream/80'
          )}
        >
          {parada.nombre || parada.stopId}
        </span>

        {scheduledTime && (
          <div className="mt-0.5 flex items-center gap-1.5">
            {realTime && hasDelay ? (
              <>
                <span className="text-xs text-rail-cream/30 line-through">{scheduledTime}</span>
                <span className="text-xs text-rail-amber">{realTime}</span>
                <span className="text-[10px] text-rail-amber">+{delayMin} min</span>
              </>
            ) : (
              <span
                className={cn(
                  'text-xs',
                  estado === 'actual'
                    ? 'text-rail-amber/70'
                    : estado === 'pasada'
                      ? 'text-rail-cream/25'
                      : 'text-rail-cream/40'
                )}
              >
                {scheduledTime}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StopTimeline ─────────────────────────────────────────────────────────────

export interface StopTimelineProps {
  paradas: Parada[]
  posicionActual?: PosicionTren
  userStopId?: string
}

export function StopTimeline({ paradas, posicionActual, userStopId }: StopTimelineProps) {
  const t = useTranslations('viaje')
  const locale = useLocale()
  const shouldReduce = useReducedMotion()
  const [showPrevious, setShowPrevious] = useState(false)

  const userIdx = userStopId
    ? paradas.findIndex((p) => p.stopId === userStopId)
    : -1
  const hasPrevious = userIdx > 0
  const previousParadas = hasPrevious ? paradas.slice(0, userIdx) : []
  const mainParadas = hasPrevious ? paradas.slice(userIdx) : paradas

  // Scroll the user's stop into view on first load
  useEffect(() => {
    if (!userStopId) return
    const el = document.getElementById(`stop-${userStopId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [userStopId])

  return (
    <div className="px-4 pt-4 pb-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rail-cream/30">
        {t('stops')}
      </h2>

      {/* Collapsible previous stops */}
      {hasPrevious && (
        <div className="mb-3">
          <button
            onClick={() => setShowPrevious((v) => !v)}
            aria-expanded={showPrevious}
            aria-controls="previous-stops-section"
            className="flex items-center gap-1.5 text-xs text-rail-cream/30 transition hover:text-rail-cream/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]"
            data-testid="toggle-previous-stops"
          >
            {showPrevious ? (
              <>
                <ChevronUp className="h-3 w-3" />
                {t('hidePreviousStops')}
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                {t('showPreviousStops', { count: previousParadas.length })}
              </>
            )}
          </button>

          <AnimatePresence>
            {showPrevious && (
              <motion.div
                key="prev"
                id="previous-stops-section"
                initial={shouldReduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={shouldReduce ? {} : { height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
                data-testid="previous-stops-section"
              >
                <ul role="list" className="mt-3 opacity-50">
                  {previousParadas.map((p, i) => (
                    <li key={p.stopId} role="listitem">
                      <StopRow
                        parada={p}
                        absoluteIdx={i}
                        allParadas={paradas}
                        posicionActual={posicionActual}
                        isLast={i === previousParadas.length - 1}
                        locale={locale}
                      />
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Main stops with stagger entry */}
      <ul role="list">
        {mainParadas.map((p, i) => {
          const absoluteIdx = hasPrevious ? userIdx + i : i
          return (
            <motion.li
              key={p.stopId}
              role="listitem"
              initial={shouldReduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: shouldReduce ? 0 : i * 0.04, duration: 0.22, ease: 'easeOut' }}
            >
              <StopRow
                parada={p}
                absoluteIdx={absoluteIdx}
                allParadas={paradas}
                posicionActual={posicionActual}
                isLast={absoluteIdx === paradas.length - 1}
                locale={locale}
              />
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
