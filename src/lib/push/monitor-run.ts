// Orquestación del monitor de alertas push: lee suscripciones, consulta
// GTFS-RT + horario estático y decide qué notificaciones disparar.
//
// Se ejecuta por dos vías:
//   - Cron (Vercel) → /api/cron/monitor-push (Hobby: 1/día; Pro: cada minuto).
//   - Piggyback → maybeRunPushMonitor() desde /horarios y /viaje cuando la
//     consulta es de hoy (best-effort en Hobby, throttle de 30s).

import { fetchTripUpdates, indexTripUpdatesById } from '@/lib/renfe/gtfs-rt'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/push/web-push'
import { gtfsTimeToUnix, todayISO } from '@/lib/renfe/time'
import {
  computePredictedArrivalSec,
  isFeedFresh,
  formatHM,
  formatTripRef,
  inferFeed,
  resolveDelaySec,
  shouldSendArrival,
  shouldSendDelay,
  type FeedType,
} from '@/lib/push/monitor'

/** Entre disparos piggyback del mismo feed (evita carga/escalada). */
export const PIGGYBACK_INTERVAL_SEC = 30

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  trip_code: string | null
  station_id: string | null
  notify_delay: boolean
  notify_arrival: boolean
  delay_threshold_sec: number
  arrival_threshold_sec: number
  service_date: string | null
  last_delay_sent_at: string | null
  last_arrival_sent_at: string | null
}

interface StaticStopKey {
  tripId: string
  stationId: string
  /** GTFS "HH:MM:SS" programada en la parada suscrita. */
  departureTime: string
  routeId: string | null
}

export interface MonitorRunResult {
  checked: number
  sent: Array<{ id: string; tripCode: string; eventType: 'delay' | 'arrival' }>
  dryRun: boolean
  skippedFeedFreshness: number
  skippedNoTripUpdate: number
  errors: number
}

function toUnixSec(iso: string | null): number | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  return Number.isNaN(ts) ? null : Math.floor(ts / 1000)
}

function lastSentAtUnix(sub: SubscriptionRow): { delay: number | null; arrival: number | null } {
  return {
    delay: toUnixSec(sub.last_delay_sent_at),
    arrival: toUnixSec(sub.last_arrival_sent_at),
  }
}

export async function runPushMonitor(options?: { dryRun?: boolean }): Promise<MonitorRunResult> {
  const dryRun = options?.dryRun ?? false
  const Result: MonitorRunResult = {
    checked: 0,
    sent: [],
    dryRun,
    skippedFeedFreshness: 0,
    skippedNoTripUpdate: 0,
    errors: 0,
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const nowISO = new Date(nowSec * 1000).toISOString()
  const serviceDate = todayISO()

  // 1. Suscripciones activas de esta corrida (hoy) y con estación+aviso
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select(
      'id, endpoint, p256dh, auth, trip_code, station_id, notify_delay, notify_arrival, delay_threshold_sec, arrival_threshold_sec, service_date, last_delay_sent_at, last_arrival_sent_at'
    )
    .eq('service_date', serviceDate)
    .eq('active', true)
    .not('trip_code', 'is', null)
    .not('station_id', 'is', null)
    .or('notify_delay.eq.true,notify_arrival.eq.true')

  if (subsError) throw new Error(`push monitor: ${subsError.message}`)
  if (!subs || subs.length === 0) return Result

  const rows = subs as unknown as SubscriptionRow[]
  Result.checked = rows.length

  // 2. Nombres de estación (lote)
  const stationIds = [...new Set(rows.map((r) => r.station_id).filter(Boolean))] as string[]
  const { data: stationsData } = await supabaseAdmin
    .from('stations')
    .select('id, name')
    .in('id', stationIds)
  const stationNames = new Map<string, string>()
  for (const s of (stationsData ?? []) as Array<{ id: string; name: string }>) {
    stationNames.set(s.id, s.name)
  }

  // 3. Agrupar por tren
  const byTrip = new Map<string, SubscriptionRow[]>()
  for (const sub of rows) {
    if (!sub.trip_code) continue
    const list = byTrip.get(sub.trip_code)
    if (list) list.push(sub)
    else byTrip.set(sub.trip_code, [sub])
  }

  // 4. Por tren: datos estáticos + feed RT + evaluar cada suscripción
  for (const [tripCode, tripSubs] of byTrip) {
    const stationIdsForTrip = [...new Set(tripSubs.map((s) => s.station_id).filter(Boolean))] as string[]
    if (stationIdsForTrip.length === 0) continue

    let stopRows: Array<{ trip_id: string; stop_id: string; departure_time: string; route_id: string | null }> = []
    try {
      const { data } = await supabaseAdmin
        .from('gtfs_stop_times')
        .select('trip_id, stop_id, departure_time, route_id')
        .eq('trip_id', tripCode)
        .in('stop_id', stationIdsForTrip)
        .limit(100)
      stopRows = (data ?? []) as typeof stopRows
    } catch {
      Result.errors += 1
      continue
    }

    const staticByStop = new Map<string, StaticStopKey>()
    for (const row of stopRows) {
      staticByStop.set(row.stop_id, {
        tripId: row.trip_id,
        stationId: row.stop_id,
        departureTime: row.departure_time,
        routeId: row.route_id,
      })
    }

    // Feed RT del tipo inferido por la línea del primer dato estático
    const routeId = stopRows[0]?.route_id ?? ''
    const feedType: FeedType = inferFeed(routeId)

    let feedResult
    try {
      feedResult = await fetchTripUpdates(feedType)
    } catch {
      Result.errors += 1
      continue
    }

    if (feedResult.stale || !isFeedFresh(feedResult.feed, nowSec)) {
      Result.skippedFeedFreshness += tripSubs.length
      continue
    }

    const tripUpdate = indexTripUpdatesById(feedResult.feed)[tripCode]
    if (!tripUpdate) {
      Result.skippedNoTripUpdate += tripSubs.length
      continue
    }

    for (const sub of tripSubs) {
      try {
        const stationId = sub.station_id
        if (!stationId) continue
        const staticStop = staticByStop.get(stationId)
        const rtStop = tripUpdate.stopTimeUpdate?.find((u) => u.stopId === stationId)
        const delaySec = resolveDelaySec(rtStop, tripUpdate)
        const stationName = stationNames.get(stationId) ?? stationId
        const tripRef = formatTripRef(tripCode)
        const lastSent = lastSentAtUnix(sub)

        const predictedArrivalSec =
          staticStop != null
            ? computePredictedArrivalSec(
                gtfsTimeToUnix(staticStop.departureTime, serviceDate),
                delaySec
              )
            : null

        const events: Array<'delay' | 'arrival'> = []

        if (sub.notify_delay && shouldSendDelay({
          delaySec,
          nowSec,
          thresholdSec: sub.delay_threshold_sec,
          lastSentAtSec: lastSent.delay,
        })) {
          events.push('delay')
        }

        if (sub.notify_arrival && predictedArrivalSec != null && rtStop && shouldSendArrival({
          nowSec,
          predictedSec: predictedArrivalSec,
          thresholdSec: sub.arrival_threshold_sec,
        })) {
          events.push('arrival')
        }

        if (events.length === 0) continue

        for (const eventType of events) {
          // 5. Candado anti-duplicado: INSERT antes de enviar
          const lockResult = await supabaseAdmin
            .from('push_events')
            .insert({
              subscription_id: sub.id,
              trip_code: tripCode,
              event_type: eventType,
              service_date: serviceDate,
            })
            .select('id')
            .limit(1)

          if (lockResult.error) {
            // Violación de unicidad (23505) = otro monitor ya lo envió
            if (lockResult.error.code !== '23505') Result.errors += 1
            continue
          }

          if (dryRun) {
            Result.sent.push({ id: sub.id, tripCode, eventType })
            continue
          }

          // 6. Enviar push
          const delayMin = Math.max(1, Math.round(delaySec / 60))
          const payload =
            eventType === 'delay'
              ? {
                  title: `Tren ${tripRef}`,
                  body: `Lleva un retraso de ${delayMin} min`,
                  data: {
                    type: 'delay' as const,
                    tripCode,
                    serviceDate,
                    url: `/viaje/${encodeURIComponent(tripCode)}?stopId=${encodeURIComponent(stationId)}&fecha=${serviceDate}`,
                  },
                }
              : {
                  title: `Tren ${tripRef}`,
                  body: `Llega a ${stationName} sobre las ${formatHM(
                    predictedArrivalSec as number
                  )}`,
                  data: {
                    type: 'arrival' as const,
                    tripCode,
                    serviceDate,
                    url: `/viaje/${encodeURIComponent(tripCode)}?stopId=${encodeURIComponent(stationId)}&fecha=${serviceDate}`,
                  },
                }

          await sendPushNotification(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            payload
          )

          // 7. Marcar como enviado (cooldown)
          await supabaseAdmin
            .from('push_subscriptions')
            .update(
              eventType === 'delay'
                ? { last_delay_sent_at: nowISO }
                : { last_arrival_sent_at: nowISO }
            )
            .eq('id', sub.id)

          Result.sent.push({ id: sub.id, tripCode, eventType })
        }
      } catch {
        Result.errors += 1
      }
    }
  }

  return Result
}

// ─── Piggyback (Hobby best-effort) ────────────────────────────────────────────

function throttleKey(feed: FeedType): string {
  return `push:monitor:last_run:${feed}`
}

// Guard en memoria: si un run ya está en marcha para ese feed, no se relanza.
const inflightFeeds = new Set<FeedType>()

async function isThrottled(feed: FeedType): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('adif_cache')
    .select('expires_at')
    .eq('key', throttleKey(feed))
    .maybeSingle()
  if (!data) return false
  return new Date(data.expires_at as string) > new Date()
}

async function markThrottle(feed: FeedType): Promise<void> {
  const expiresAt = new Date(Date.now() + PIGGYBACK_INTERVAL_SEC * 1000).toISOString()
  await supabaseAdmin
    .from('adif_cache')
    .upsert(
      { key: throttleKey(feed), data: { run_at: Date.now() } as unknown as import('@/types/database').Json, expires_at: expiresAt },
      { onConflict: 'key' }
    )
}

/**
 * Dispara el monitor en segundo plano (fire-and-forget) si no está ya
 * throttled. Nunca lanza: protege el hot path de /horarios y /viaje.
 */
export function maybeRunPushMonitor(feed: FeedType): void {
  if (inflightFeeds.has(feed)) return
  inflightFeeds.add(feed)

  isThrottled(feed)
    .then((throttled) => {
      if (throttled) return
      return markThrottle(feed)
        .then(() => runPushMonitor())
        .catch((err) => {
          console.error('[push-monitor] piggyback run failed:', err)
        })
        .finally(() => inflightFeeds.delete(feed))
    })
    .catch(() => inflightFeeds.delete(feed))
}