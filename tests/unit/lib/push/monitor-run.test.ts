import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gtfsTimeToUnix, todayISO } from '@/lib/renfe/time'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const queues: Record<string, Array<() => unknown>> = {}

  function builderFor(table: string) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      ilike: () => builder,
      like: () => builder,
      or: () => builder,
      not: () => builder,
      limit: () => builder,
      maybeSingle: () => builder,
      insert: () => builder,
      update: () => builder,
      then(resolveFn: (value: unknown) => void) {
        const next = queues[table]?.shift()
        resolveFn(next ? next() : { data: null, error: null })
        return undefined
      },
    }
    return builder
  }

  const supabaseAdmin = { from: (table: string) => builderFor(table) }

  function pushResponse(table: string, response: unknown) {
    if (!queues[table]) queues[table] = []
    queues[table].push(() => response)
  }

  return {
    supabaseAdmin,
    pushResponse,
    queues,
    fetchTripUpdates: vi.fn(),
    sendPushNotification: vi.fn(),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

vi.mock('@/lib/renfe/gtfs-rt', () => ({
  fetchTripUpdates: mocks.fetchTripUpdates,
  indexTripUpdatesById: (feed: {
    entity: Array<{ tripUpdate: { trip: { tripId: string }; stopTimeUpdate: unknown[] } }>
  }) => {
    const map: Record<string, unknown> = {}
    for (const e of feed.entity) {
      if (e.tripUpdate) map[e.tripUpdate.trip.tripId] = e.tripUpdate
    }
    return map
  },
}))

vi.mock('@/lib/push/web-push', () => ({
  sendPushNotification: mocks.sendPushNotification,
}))

import { runPushMonitor } from '@/lib/push/monitor-run'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVICE_ID = 'svc-cer-0915'
const TRIP = '5154D15734R11'
const TRAIN_NUM = '15734'
const ROUTE_ID = 'R11'
const STATION = '79104'

const SUB_A = {
  id: 'sub-a',
  endpoint: 'https://fcm/push/a',
  p256dh: 'aQ==',
  auth: 'aQ==',
  trip_code: '5142X15734R11',
  train_number: TRAIN_NUM,
  route_id: ROUTE_ID,
  station_id: STATION,
  notify_delay: true,
  notify_arrival: false,
  delay_threshold_sec: 300,
  arrival_threshold_sec: 600,
  service_date: todayISO(),
  last_delay_sent_at: null,
  last_arrival_sent_at: null,
}

const SUB_B = {
  ...SUB_A,
  id: 'sub-b',
  endpoint: 'https://fcm/push/b',
  notify_delay: false,
  notify_arrival: true,
}

/** Hora GTFS "HH:MM:SS" (Madrid) = now + offsetSec. */
function gtfsTimeAt(offsetSec: number, nowSec: number): string {
  return new Date((nowSec + offsetSec) * 1000).toLocaleTimeString('sv-SE', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function scheduleForToday(): Array<Record<string, unknown>> {
  return [
    {
      service_id: SERVICE_ID,
      start_date: '2025-01-01',
      end_date: '2099-12-31',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
    },
  ]
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/** Flags de servicio con UN día en false: el de hoy, para forzar no-servicio. */
function scheduleNotOperatingToday(): Array<Record<string, unknown>> {
  const dow = new Date(`${todayISO()}T12:00:00Z`).getUTCDay()
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const flags = Object.fromEntries(days.map((d) => [d, true]))
  flags[days[dow]] = false
  return [
    {
      service_id: SERVICE_ID,
      start_date: '2025-01-01',
      end_date: '2099-12-31',
      ...flags,
    },
  ]
}

describe('runPushMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(mocks.queues)) delete mocks.queues[k]
    mocks.sendPushNotification.mockResolvedValue(undefined)
  })

  it('resuelve trip del día y envía retraso + llegada con lock antes del envío', async () => {
    const nowSec = Math.floor(Date.now() / 1000)

    mocks.pushResponse('push_subscriptions', { data: [SUB_A, SUB_B], error: null })
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })
    // resolveTodayTrip: gtfs_trips + gtfs_services + gtfs_service_exceptions
    mocks.pushResponse('gtfs_trips', {
      data: [{ trip_id: TRIP, service_id: SERVICE_ID, feed_source: 'cercanias' }],
    })
    mocks.pushResponse('gtfs_services', { data: scheduleForToday(), error: null })
    mocks.pushResponse('gtfs_service_exceptions', { data: [], error: null })
    mocks.pushResponse('gtfs_stop_times', {
      data: [{ trip_id: TRIP, stop_id: STATION, departure_time: gtfsTimeAt(120, nowSec), route_id: ROUTE_ID }],
      error: null,
    })

    mocks.fetchTripUpdates.mockResolvedValue({
      stale: false,
      fetchedAt: nowSec * 1000,
      feed: {
        header: { timestamp: nowSec - 10 },
        entity: [
          {
            id: TRIP,
            tripUpdate: {
              trip: { tripId: TRIP, routeId: ROUTE_ID },
              stopTimeUpdate: [
                { stopId: STATION, departure: { delay: 420, time: gtfsTimeToUnix(gtfsTimeAt(120, nowSec), todayISO()) + 420 } },
                { stopId: '71000', departure: { delay: 0 } },
              ],
            },
          },
        ],
      },
    })

    // Locks push_events: delay (sub-a) y arrival (sub-b)
    mocks.pushResponse('push_events', { data: [{ id: 'ev-1' }], error: null })
    mocks.pushResponse('push_events', { data: [{ id: 'ev-2' }], error: null })
    // Updates last_sent
    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('push_subscriptions', { data: [SUB_B], error: null })

    const result = await runPushMonitor()

    expect(result.checked).toBe(2)
    expect(result.sent).toHaveLength(2)
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(2)

    const delayCall = mocks.sendPushNotification.mock.calls[0]
    expect(delayCall[1]).toMatchObject({
      title: `Tren ${TRAIN_NUM}`,
      body: 'Lleva un retraso de 7 min',
    })

    const arrivalCall = mocks.sendPushNotification.mock.calls[1]
    expect(arrivalCall[1].body).toContain('Sant Celoni')
  })

  it('skippedNoServiceToday cuando el servicio no opera hoy', async () => {
    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })
    mocks.pushResponse('gtfs_trips', {
      data: [{ trip_id: TRIP, service_id: SERVICE_ID, feed_source: 'cercanias' }],
    })
    // Hoy el servicio no opera (el día actual está apagado)
    mocks.pushResponse('gtfs_services', { data: scheduleNotOperatingToday(), error: null })
    mocks.pushResponse('gtfs_service_exceptions', { data: [], error: null })

    const result = await runPushMonitor()
    expect(result.skippedNoServiceToday).toBe(1)
    expect(result.sent).toHaveLength(0)
    expect(mocks.fetchTripUpdates).not.toHaveBeenCalled()
  })

  it('no reenvía eventos ya insertados (23505)', async () => {
    const nowSec = Math.floor(Date.now() / 1000)

    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })
    mocks.pushResponse('gtfs_trips', {
      data: [{ trip_id: TRIP, service_id: SERVICE_ID, feed_source: 'cercanias' }],
    })
    mocks.pushResponse('gtfs_services', { data: scheduleForToday(), error: null })
    mocks.pushResponse('gtfs_service_exceptions', { data: [], error: null })
    mocks.pushResponse('gtfs_stop_times', {
      data: [{ trip_id: TRIP, stop_id: STATION, departure_time: gtfsTimeAt(0, nowSec), route_id: ROUTE_ID }],
      error: null,
    })
    mocks.fetchTripUpdates.mockResolvedValue({
      stale: false,
      fetchedAt: nowSec * 1000,
      feed: {
        header: { timestamp: nowSec - 10 },
        entity: [{ id: TRIP, tripUpdate: { trip: { tripId: TRIP, routeId: ROUTE_ID }, stopTimeUpdate: [{ stopId: STATION, departure: { delay: 600 } }] } }],
      },
    })

    mocks.pushResponse('push_events', { data: null, error: { code: '23505', message: 'duplicate' } })

    const result = await runPushMonitor()
    expect(result.sent).toHaveLength(0)
    expect(mocks.sendPushNotification).not.toHaveBeenCalled()
  })

  it('salta feeds stale o viejos', async () => {
    const nowSec = Math.floor(Date.now() / 1000)

    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })
    mocks.pushResponse('gtfs_trips', {
      data: [{ trip_id: TRIP, service_id: SERVICE_ID, feed_source: 'cercanias' }],
    })
    mocks.pushResponse('gtfs_services', { data: scheduleForToday(), error: null })
    mocks.pushResponse('gtfs_service_exceptions', { data: [], error: null })
    mocks.pushResponse('gtfs_stop_times', {
      data: [{ trip_id: TRIP, stop_id: STATION, departure_time: gtfsTimeAt(0, nowSec), route_id: ROUTE_ID }],
      error: null,
    })
    mocks.fetchTripUpdates.mockResolvedValue({
      stale: true,
      fetchedAt: nowSec * 1000,
      feed: { header: { timestamp: nowSec - 10 }, entity: [] },
    })

    const result = await runPushMonitor()
    expect(result.sent).toHaveLength(0)
    expect(result.skippedFeedFreshness).toBe(1)
    expect(mocks.sendPushNotification).not.toHaveBeenCalled()
  })

  it('devuelve vacío sin suscripciones activas', async () => {
    mocks.pushResponse('push_subscriptions', { data: [], error: null })
    const result = await runPushMonitor()
    expect(result.checked).toBe(0)
    expect(result.sent).toHaveLength(0)
  })
})