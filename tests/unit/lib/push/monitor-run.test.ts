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
  indexTripUpdatesById: (feed: { entity: Array<{ tripUpdate: { trip: { tripId: string }; stopTimeUpdate: unknown[] } }> }) => {
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

const SUB_A = {
  id: 'sub-a',
  endpoint: 'https://fcm/push/a',
  p256dh: 'aQ==',
  auth: 'aQ==',
  trip_code: '5142X15734R11',
  station_id: '79104',
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

const TRIP = '5142X15734R11'
const STATION = '79104'

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

describe('runPushMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(mocks.queues)) delete mocks.queues[k]
    mocks.sendPushNotification.mockResolvedValue(undefined)
  })

  it('envía retraso y llegada con lock antes del envío', async () => {
    const nowSec = Math.floor(Date.now() / 1000)

    // Suscripciones del día con estación
    mocks.pushResponse('push_subscriptions', { data: [SUB_A, SUB_B], error: null })
    // Nombres de estación
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })

    const scheduledSec = gtfsTimeToUnix(gtfsTimeAt(120, nowSec), todayISO())

    // 2 suscripciones → mismo trip → 1 consulta de stop times
    mocks.pushResponse('gtfs_stop_times', {
      data: [{ trip_id: TRIP, stop_id: STATION, departure_time: gtfsTimeAt(120, nowSec), route_id: 'R11' }],
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
              trip: { tripId: TRIP, routeId: 'R11' },
              stopTimeUpdate: [
                { stopId: STATION, departure: { delay: 420, time: scheduledSec + 420 } },
                { stopId: '71000', departure: { delay: 0 } },
              ],
            },
          },
        ],
      },
    })

    // Locks push_events: delay (sub-a) y arrival (sub-b) → 2 inserts exitosos
    mocks.pushResponse('push_events', { data: [{ id: 'ev-1' }], error: null })
    mocks.pushResponse('push_events', { data: [{ id: 'ev-2' }], error: null })
    // Updates last_sent
    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('push_subscriptions', { data: [SUB_B], error: null })

    const result = await runPushMonitor()

    expect(result.checked).toBe(2)
    expect(result.sent).toHaveLength(2)
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(2)

    // Retraso (sub-a): sin nombre de estación en el cuerpo
    const delayCall = mocks.sendPushNotification.mock.calls[0]
    expect(delayCall[1]).toMatchObject({
      title: 'Tren 15734',
      body: 'Lleva un retraso de 7 min',
    })

    // Llegada (sub-b): menciona la estación
    const arrivalCall = mocks.sendPushNotification.mock.calls[1]
    expect(arrivalCall[1].body).toContain('Sant Celoni')

    // Locks insertados antes de enviar
    const events = mocks.queues['push_events']
    expect(events).toHaveLength(0) // consumidos
  })

  it('no reenvía eventos ya insertados (23505)', async () => {
    const nowSec = Math.floor(Date.now() / 1000)

    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })
    mocks.pushResponse('gtfs_stop_times', {
      data: [{ trip_id: TRIP, stop_id: STATION, departure_time: gtfsTimeAt(0, nowSec), route_id: 'R11' }],
      error: null,
    })
    mocks.fetchTripUpdates.mockResolvedValue({
      stale: false,
      fetchedAt: nowSec * 1000,
      feed: {
        header: { timestamp: nowSec - 10 },
        entity: [{ id: TRIP, tripUpdate: { trip: { tripId: TRIP, routeId: 'R11' }, stopTimeUpdate: [{ stopId: STATION, departure: { delay: 600 } }] } }],
      },
    })

    // El lock falla por unicidad → no se envía ni se actualiza
    mocks.pushResponse('push_events', { data: null, error: { code: '23505', message: 'duplicate' } })
    mocks.pushResponse('push_subscriptions', { data: null, error: null })

    const result = await runPushMonitor()

    expect(result.sent).toHaveLength(0)
    expect(mocks.sendPushNotification).not.toHaveBeenCalled()
  })

  it('salta feeds stale o viejos', async () => {
    const nowSec = Math.floor(Date.now() / 1000)

    mocks.pushResponse('push_subscriptions', { data: [SUB_A], error: null })
    mocks.pushResponse('stations', { data: [{ id: STATION, name: 'Sant Celoni' }], error: null })
    mocks.pushResponse('gtfs_stop_times', {
      data: [{ trip_id: TRIP, stop_id: STATION, departure_time: gtfsTimeAt(0, nowSec), route_id: 'R11' }],
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

  it('devuelve vacío sin suscripciones del día', async () => {
    mocks.pushResponse('push_subscriptions', { data: [], error: null })
    const result = await runPushMonitor()
    expect(result.checked).toBe(0)
    expect(result.sent).toHaveLength(0)
  })
})