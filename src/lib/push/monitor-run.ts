// Orquestación del monitor de alertas push: lee suscripciones, consulta
// GTFS-RT + horario estático y decide qué notificaciones disparar.
//
// La suscripción es al TREN (train_number + route_id) para TODOS los días que
// circule, así que cada día resolver a qué trip_id concreto corresponde el
// tren (el mismo tren tiene trip_ids distintos según la fecha de servicio).
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
  train_number: string | null
  route_id: string | null
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

interface TripRow {
  trip_id: string
  service_id: string
  feed_source: string
}

interface DayFlags {
  monday: boolean
  tuesday: boolean
  wednesday: boolean
  thursday: boolean
  friday: boolean
  saturday: boolean
  sunday: boolean
}

export interface MonitorRunResult {
  checked: number
  sent: Array<{ id: string; tripCode: string; eventType: 'delay' | 'arrival' }>
  dryRun: boolean
  skippedFeedFreshness: number
  skippedNoTripUpdate: number
  /** Trenes suscritos que hoy no circulan (según el calendario GTFS). */
  skippedNoServiceToday: number
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

/** Clave de agrupación: identidad de tren (número + línea), con fallback al
 *  trip_code para suscripciones legacy (comportamiento por día). */
function tripIdentityKey(sub: SubscriptionRow): string {
  return `${sub.train_number ?? sub.trip_code}::${sub.route_id ?? ''}`
}

/** `true` si el servicio GTFS opera hoy (rango + día de la semana). */
function serviceRunsToday(
  svc: DayFlags & { start_date: string; end_date: string },
  today: string
): boolean {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay()
  // getUTCDay(): 0 = domingo … 6 = sábado
  const flags = [svc.sunday, svc.monday, svc.tuesday, svc.wednesday, svc.thursday, svc.friday, svc.saturday]
  return svc.start_date <= today && today <= svc.end_date && flags[dow] === true
}

export async function runPushMonitor(options?: { dryRun?: boolean }): Promise<MonitorRunResult> {
  const dryRun = options?.dryRun ?? false
  const Result: MonitorRunResult = {
    checked: 0,
    sent: [],
    dryRun,
    skippedFeedFreshness: 0,
    skippedNoTripUpdate: 0,
    skippedNoServiceToday: 0,
    errors: 0,
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const nowISO = new Date(nowSec * 1000).toISOString()
  const serviceDate = todayISO()

  // 1. Suscripciones activas con estación y algún aviso (TODAS, no solo hoy)
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select(
      'id, endpoint, p256dh, auth, trip_code, train_number, route_id, station_id, notify_delay, notify_arrival, delay_threshold_sec, arrival_threshold_sec, service_date, last_delay_sent_at, last_arrival_sent_at'
    )
    .eq('active', true)
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

  // 3. Agrupar por tren (número + línea)
  const byTrain = new Map<string, { trainNumber: string; routeId: string | null; subs: SubscriptionRow[] }>()
  for (const sub of rows) {
    const key = tripIdentityKey(sub)
    const group = byTrain.get(key)
    if (group) group.subs.push(sub)
    else
      byTrain.set(key, {
        trainNumber: sub.train_number ?? sub.trip_code ?? '',
        routeId: sub.route_id,
        subs: [sub],
      })
  }

  // 4. Por tren: resolver el trip de hoy, datos estáticos, feed RT, evaluar
  for (const group of byTrain.values()) {
    const stationIdsForTrip = [...new Set(group.subs.map((s) => s.station_id).filter(Boolean))] as string[]
    if (stationIdsForTrip.length === 0) continue

    // 4a. Resolver el trip_id de HOY del tren (o legacy: usa su trip_code)
    let tripCode = group.trainNumber
    if (group.routeId) {
      const resolved = await resolveTodayTrip(group.trainNumber, group.routeId, serviceDate)
      if (resolved.type === 'no-service') {
        Result.skippedNoServiceToday += group.subs.length
        continue
      }
      if (resolved.type === 'error') {
        Result.errors += group.subs.length
        continue
      }
      tripCode = resolved.tripId
    }
    const tripSubs = group.subs
    const routeIdForFeed = group.routeId ?? null

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
      Result.errors += group.subs.length
      continue
    }

    if (stopRows.length === 0) {
      Result.skippedNoServiceToday += tripSubs.length
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

    // Feed RT según la línea del primer dato estático
    const routeId = routeIdForFeed ?? stopRows[0]?.route_id ?? ''
    const feedType: FeedType = inferFeed(routeId)

    let feedResult
    try {
      feedResult = await fetchTripUpdates(feedType)
    } catch {
      Result.errors += tripSubs.length
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
        const tripRef = sub.train_number ?? formatTripRef(tripCode)
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

type ResolveResult =
  | { type: 'ok'; tripId: string }
  | { type: 'no-service'; tripId: string | null }
  | { type: 'error'; tripId: string | null }

/**
 * Dado tren (número + línea) y una fecha, encuentra el trip_id de GTFS que
 * circula ese día. El mismo tren físico tiene un trip_id distinto por fecha de
 * servicio ("5154D15726R11" un día, "5155L15726R11" otro), así que se cruza
 * gtfs_trips (búsqueda por número+línea) con el calendario gtfs_services y las
 * excepciones (gtfs_service_exceptions) para saber qué servicio está activo.
 */
async function resolveTodayTrip(
  trainNumber: string,
  routeId: string,
  today: string
): Promise<ResolveResult> {
  try {
    const { data: trips, error: tripsError } = await supabaseAdmin
      .from('gtfs_trips')
      .select('trip_id, service_id, feed_source')
      .ilike('trip_id', `%${trainNumber}%`)
      .eq('route_id', routeId)
      .limit(200)

    if (tripsError) return { type: 'error', tripId: null }
    const tripRows = (trips ?? []) as unknown as TripRow[]
    if (tripRows.length === 0) return { type: 'no-service', tripId: null }

    const serviceIds = [...new Set(tripRows.map((t) => t.service_id))]

    const { data: services, error: svcError } = await supabaseAdmin
      .from('gtfs_services')
      .select('service_id, start_date, end_date, monday, tuesday, wednesday, thursday, friday, saturday, sunday')
      .in('service_id', serviceIds)
      .limit(300)
    if (svcError) return { type: 'error', tripId: null }

    const { data: exceptions, error: excError } = await supabaseAdmin
      .from('gtfs_service_exceptions')
      .select('service_id, exception_type')
      .in('service_id', serviceIds)
      .eq('exception_date', today)
      .limit(100)
    if (excError) return { type: 'error', tripId: null }

    const activeToday = new Map<string, boolean>()
    const removedToday = new Set<string>()
    for (const e of (exceptions ?? []) as unknown as Array<{
      service_id: string
      exception_type: number
    }>) {
      // 1 = servicio añadido, 2 = servicio suprimido
      if (e.exception_type === 2) removedToday.add(e.service_id)
    }

    for (const svc of (services ?? []) as Array<DayFlags & { service_id: string; start_date: string; end_date: string }>) {
      const runs = serviceRunsToday(svc, today)
      if (runs && !removedToday.has(svc.service_id)) activeToday.set(svc.service_id, true)
    }

    const trip = tripRows.find((t) => activeToday.get(t.service_id))
    if (!trip) return { type: 'no-service', tripId: null }
    return { type: 'ok', tripId: trip.trip_id }
  } catch {
    return { type: 'error', tripId: null }
  }
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