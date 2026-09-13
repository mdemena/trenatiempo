// Lógica pura del monitor de alertas push. Sin acceso a red/BD: decisiones
// sobre delays y ventanas de llegada, testables de forma unitaria.
// La orquestación (fetch feeds, queries, envío) vive en la ruta del cron.

import type { StopTimeUpdate, TripUpdate } from '@/lib/renfe/types'

export const FEED_TYPES = ['cercanias', 'md'] as const
export type FeedType = (typeof FEED_TYPES)[number]

/** Umbrales por defecto (segundos). Coinciden con los defaults del schema. */
export const DELAY_THRESHOLD_DEFAULT_SEC = 300
export const ARRIVAL_THRESHOLD_DEFAULT_SEC = 600

/** Margen tras la hora prevista en el que la ventana de llegada sigue abierta. */
export const ARRIVAL_WINDOW_MARGIN_SEC = 120

/** Cooldown entre avisos de retraso del mismo tren (evita spam si el feed
 *  reporta el retraso de forma intermitente). */
export const DELAY_COOLDOWN_SEC = 30 * 60

/** Un feed GTFS-RT más viejo que esto no se procesa (los trip_updates se
 *  publican cada 20-30 s). */
export const MAX_FEED_AGE_SEC = 5 * 60

/**
 * Infiere el feed GTFS-RT que alimenta un tren a partir de su línea.
 * En el import estático las líneas C* Y R* (R11, R3, R2S…) van al feed de
 * `cercanias` (gtfsrt.renfe.com), mientras que AV/LD/MD (AVE, ALVIA, MD…) van
 * al feed de `md`. Ojo: no usar "todo lo que no sea C → md": las R y los buses
 * de sustitución también viven en el feed de cercanías.
 */
export function inferFeed(routeId: string | null | undefined): FeedType {
  const r = (routeId ?? '').trim().toUpperCase()
  if (/^[CR]\d/.test(r) || /^(BUS|RG\d|RL\d)/.test(r)) return 'cercanias'
  return 'md'
}

/** Delay de una parada en el feed: departure ?? arrival ?? 0. */
export function computeDelaySec(
  rtStop: StopTimeUpdate | undefined | null
): number {
  if (!rtStop) return 0
  return rtStop.departure?.delay ?? rtStop.arrival?.delay ?? 0
}

/** Mayor delay reportado en TODO el trip del feed (fallback para paradas sin
 *  delay propio). */
export function computeFeedMaxDelay(
  tripUpdate: TripUpdate | undefined | null
): number {
  if (!tripUpdate?.stopTimeUpdate?.length) return 0
  let max = 0
  for (const stu of tripUpdate.stopTimeUpdate) {
    const d = computeDelaySec(stu)
    if (d > max) max = d
  }
  return max
}

/** Delay a considerar: el de la parada concreta si existe (≠ 0), si no el
 *  mayor del feed para ese trip. */
export function resolveDelaySec(
  rtStop: StopTimeUpdate | undefined | null,
  tripUpdate: TripUpdate | undefined | null
): number {
  const specific = rtStop ? computeDelaySec(rtStop) : 0
  return specific !== 0 ? specific : computeFeedMaxDelay(tripUpdate)
}

export interface ShouldSendDelayInput {
  delaySec: number
  nowSec: number
  thresholdSec: number
  lastSentAtSec: number | null
  cooldownSec?: number
}

/** `true` cuando hay retraso ≥ umbral (y positivo) y el cooldown ha pasado. */
export function shouldSendDelay({
  delaySec,
  nowSec,
  thresholdSec,
  lastSentAtSec,
  cooldownSec = DELAY_COOLDOWN_SEC,
}: ShouldSendDelayInput): boolean {
  if (delaySec < thresholdSec || delaySec < 0) return false
  if (lastSentAtSec == null) return true
  return nowSec - lastSentAtSec >= cooldownSec
}

/** Llegada prevista (unix) = programada + retraso real de la parada. */
export function computePredictedArrivalSec(
  scheduledSec: number,
  delaySec: number
): number {
  return scheduledSec + delaySec
}

export interface ShouldSendArrivalInput {
  nowSec: number
  predictedSec: number
  thresholdSec: number
  /** Margen tras la hora prevista; por defecto ARRIVAL_WINDOW_MARGIN_SEC. */
  marginSec?: number
}

/** `true` cuando `now` cae en [predicha − umbral, predicha + margen]. La cota
 *  superior evita avisar de un tren que ya pasó (feed desactualizado). */
export function shouldSendArrival({
  nowSec,
  predictedSec,
  thresholdSec,
  marginSec = ARRIVAL_WINDOW_MARGIN_SEC,
}: ShouldSendArrivalInput): boolean {
  if (marginSec < 0) return false
  const windowStart = predictedSec - thresholdSec
  const windowEnd = predictedSec + marginSec
  return nowSec >= windowStart && nowSec <= windowEnd
}

/** Hora "HH:MM" en Madrid desde un timestamp Unix. */
export function formatHM(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Referencia legible de un tren para las notificaciones: "15734" para
 * "5142X15734R11" (número tras la X) o el tripId completo si no aplica.
 */
export function formatTripRef(tripCode: string): string {
  const match = tripCode.match(/^.*X(\d+)/)
  return match?.[1] ?? tripCode
}

/** `true` si el header del feed es suficientemente reciente como para fiarse. */
export function isFeedFresh(feed: { header?: { timestamp?: number } } | null | undefined, nowSec: number): boolean {
  if (!feed?.header?.timestamp) return false
  return nowSec - feed.header.timestamp <= MAX_FEED_AGE_SEC
}