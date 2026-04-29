'use client'

import { useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { motion, useReducedMotion } from 'motion/react'
import { Train } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Parada, PosicionTren } from '@/lib/renfe/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ParadaEstado = 'pasada' | 'actual' | 'futura'

interface StopRenderItem {
  kind: 'stop'
  parada: Parada
  paradaIdx: number
  estado: ParadaEstado
}

interface TrainRenderItem {
  kind: 'train'
}

type RenderItem = StopRenderItem | TrainRenderItem

// ─── State resolution ─────────────────────────────────────────────────────────

function resolveEstados(paradas: Parada[], posicionActual?: PosicionTren): ParadaEstado[] {
  const trainIdx = posicionActual?.stopId
    ? paradas.findIndex((p) => p.stopId === posicionActual.stopId)
    : -1

  return paradas.map((p, i) => {
    if (trainIdx === -1) {
      const dep = p.salidaReal ?? p.salidaProgramada
      return dep && dep * 1000 < Date.now() ? 'pasada' : 'futura'
    }
    if (posicionActual?.enMovimiento) {
      // IN_TRANSIT_TO trainIdx: all stops before are passed
      return i < trainIdx ? 'pasada' : 'futura'
    }
    // STOPPED_AT trainIdx
    if (i < trainIdx) return 'pasada'
    if (i === trainIdx) return 'actual'
    return 'futura'
  })
}

function buildRenderList(paradas: Parada[], posicionActual?: PosicionTren): RenderItem[] {
  const estados = resolveEstados(paradas, posicionActual)
  const items: RenderItem[] = []

  // Determine the index before which to inject the train indicator:
  //   - GPS in transit: before the stop the train is heading to
  //   - GPS stopped: no indicator needed (the stop's dot pulses amber)
  //   - No GPS: time-based estimation — before the first future stop that
  //     has at least one past stop before it (train is somewhere in the middle)
  let trainBeforeIdx = -1

  if (posicionActual?.enMovimiento && posicionActual.stopId) {
    const idx = paradas.findIndex((p) => p.stopId === posicionActual.stopId)
    if (idx > 0) trainBeforeIdx = idx
  } else if (!posicionActual?.stopId) {
    // No GPS data — infer position from schedule timing
    const firstFutureIdx = estados.findIndex((e) => e === 'futura')
    if (firstFutureIdx > 0) trainBeforeIdx = firstFutureIdx
  }

  paradas.forEach((parada, paradaIdx) => {
    if (trainBeforeIdx === paradaIdx) {
      items.push({ kind: 'train' })
    }
    items.push({ kind: 'stop', parada, paradaIdx, estado: estados[paradaIdx]! })
  })

  return items
}

// ─── Dot ─────────────────────────────────────────────────────────────────────

function StopDot({
  estado,
  isTerminus,
  isUser,
  reduce,
}: {
  estado: ParadaEstado
  isTerminus: boolean
  isUser: boolean
  reduce: boolean
}) {
  const size = isTerminus ? 'h-[1.05rem] w-[1.05rem]' : 'h-3 w-3'
  const userRing =
    isUser && estado !== 'actual'
      ? 'ring-2 ring-rail-amber/50 ring-offset-[3px] ring-offset-[#0A1628]'
      : ''

  if (estado === 'actual') {
    return (
      <motion.div
        data-pulse="true"
        animate={reduce ? {} : { scale: [1, 1.6, 1], opacity: [1, 0.45, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className={cn('rounded-full bg-rail-amber', size, isUser ? 'ring-2 ring-rail-amber/50 ring-offset-[3px] ring-offset-[#0A1628]' : '')}
      />
    )
  }

  if (estado === 'pasada') {
    return <div className={cn('rounded-full bg-white/20', size)} />
  }

  // futura
  return (
    <div
      className={cn(
        'rounded-full border-2 bg-transparent',
        isTerminus ? 'border-rail-cream/50' : 'border-rail-cream/25',
        userRing,
        size
      )}
    />
  )
}

// ─── Stop row ─────────────────────────────────────────────────────────────────

function StopRow({
  parada,
  paradaIdx,
  estado,
  totalParadas,
  isUser,
  posicionActual,
}: {
  parada: Parada
  paradaIdx: number
  estado: ParadaEstado
  totalParadas: number
  isUser: boolean
  posicionActual?: PosicionTren
}) {
  const t = useTranslations('viaje')
  const locale = useLocale()
  const reduce = useReducedMotion() ?? false

  const isFirst = paradaIdx === 0
  const isLast = paradaIdx === totalParadas - 1
  const isTerminus = isFirst || isLast
  const delayMin = Math.round((parada.delaySeg ?? 0) / 60)
  const hasDelay = delayMin > 1

  const scheduledTs = isLast ? parada.llegadaProgramada : parada.salidaProgramada
  const realTs = isLast ? parada.llegadaReal : parada.salidaReal
  const scheduledTime = scheduledTs ? formatTime(scheduledTs, locale) : null
  const realTime = realTs ? formatTime(realTs, locale) : null

  // Show platform when train is stopped here
  const anden =
    estado === 'actual' && posicionActual?.stopId === parada.stopId
      ? posicionActual.anden
      : undefined

  const nameColor = cn(
    'block truncate leading-snug',
    isTerminus ? 'text-[13.5px] font-semibold' : 'text-[13px] font-medium',
    estado === 'actual'
      ? 'text-rail-amber'
      : estado === 'pasada'
        ? 'text-rail-cream/35'
        : isUser
          ? 'text-rail-cream'
          : 'text-rail-cream/70'
  )

  const timeColor = cn(
    'text-[11px] tabular-nums',
    estado === 'actual'
      ? 'text-rail-amber/70'
      : estado === 'pasada'
        ? 'text-rail-cream/20'
        : 'text-rail-cream/40'
  )

  return (
    <div
      data-testid={`stop-${parada.stopId}`}
      data-estado={estado}
      className="flex items-stretch"
      id={`stop-${parada.stopId}`}
    >
      {/* ── Left: dot + downward connector ── */}
      <div className="flex w-10 shrink-0 flex-col items-center">
        {/* Dot centered in a fixed-height zone for consistent rhythm */}
        <div className="flex h-[1.375rem] w-full items-center justify-center">
          <StopDot
            estado={estado}
            isTerminus={isTerminus}
            isUser={isUser}
            reduce={reduce}
          />
        </div>
        {/* Connector line below the dot (flex-1 = fills height of right column) */}
        {!isLast && (
          <div
            className={cn(
              'w-px flex-1',
              estado === 'pasada' ? 'bg-white/8' : 'bg-white/15'
            )}
          />
        )}
      </div>

      {/* ── Right: content ── */}
      <div className={cn('min-w-0 flex-1 pb-[1.1rem]', isLast && 'pb-1')}>
        {/* "Tu parada" tag */}
        {isUser && (
          <span className="mb-[3px] block text-[10px] font-bold uppercase tracking-widest text-rail-amber">
            {t('yourStop')}
          </span>
        )}

        {/* Stop name */}
        <span className={nameColor}>{parada.nombre || parada.stopId}</span>

        {/* Platform (shown when train is stopped here) */}
        {anden && (
          <span className="mt-0.5 block text-[11px] text-rail-amber/65">
            {t('platform', { number: anden })}
          </span>
        )}

        {/* Time */}
        {scheduledTime && (
          <div className="mt-[3px] flex items-center gap-1.5">
            {realTime && hasDelay ? (
              <>
                <span className="text-[11px] tabular-nums text-rail-cream/25 line-through">
                  {scheduledTime}
                </span>
                <span className="text-[11px] tabular-nums text-rail-amber">
                  {realTime}
                </span>
                <span className="text-[10px] text-rail-amber">+{delayMin} min</span>
              </>
            ) : (
              <span className={timeColor}>{scheduledTime}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Train in-transit indicator ───────────────────────────────────────────────

function TrainInTransitRow() {
  const t = useTranslations('viaje')
  const reduce = useReducedMotion() ?? false

  return (
    <div className="flex items-center">
      <div className="flex w-10 shrink-0 flex-col items-center">
        {/* Top stub connecting from previous stop's line */}
        <div className="h-2 w-px bg-rail-amber/40" />
        {/* Animated train badge */}
        <motion.div
          animate={reduce ? {} : { scale: [1, 1.1, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-rail-amber shadow-lg shadow-rail-amber/25 ring-4 ring-rail-amber/15"
        >
          <Train className="h-3.5 w-3.5 text-[#0A1628]" />
        </motion.div>
        {/* Bottom stub connecting to next stop's line */}
        <div className="h-2 w-px bg-white/15" />
      </div>
      <p className="pl-0.5 text-[12px] font-medium text-rail-amber/80">{t('inTransit')}</p>
    </div>
  )
}

// ─── Section renderer ─────────────────────────────────────────────────────────

function renderItem(
  item: RenderItem,
  totalParadas: number,
  userStopId: string | undefined,
  posicionActual: PosicionTren | undefined
) {
  if (item.kind === 'train') {
    return <TrainInTransitRow key="train-indicator" />
  }

  return (
    <StopRow
      key={item.parada.stopId}
      parada={item.parada}
      paradaIdx={item.paradaIdx}
      estado={item.estado}
      totalParadas={totalParadas}
      isUser={item.parada.stopId === userStopId}
      posicionActual={posicionActual}
    />
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

  const allItems = buildRenderList(paradas, posicionActual)

  // Scroll user stop into view once on mount
  useEffect(() => {
    if (!userStopId) return
    const el = document.getElementById(`stop-${userStopId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [userStopId])

  return (
    <div className="px-4 pb-10 pt-3">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rail-cream/30">
        {t('stops')}
      </h2>

      {allItems.map((item) =>
        renderItem(item, paradas.length, userStopId, posicionActual)
      )}
    </div>
  )
}
