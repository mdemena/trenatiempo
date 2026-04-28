import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseAnden, resolveEstado, indexTripUpdatesById, indexVehiclePositionsById } from '@/lib/renfe/gtfs-rt'
import type { GtfsRtFeed } from '@/lib/renfe/types'

// Mock del módulo supabase/admin para no necesitar credenciales en tests
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}))

const FEED_FIXTURE: GtfsRtFeed = {
  header: { gtfsRealtimeVersion: '2.0', timestamp: 1700000000 },
  entity: [
    {
      id: 'entity-1',
      tripUpdate: {
        trip: { tripId: 'C1-23537', routeId: 'C1' },
        stopTimeUpdate: [
          {
            stopId: '60000',
            arrival: { delay: 120, time: 1700000200 },
            departure: { delay: 120, time: 1700000260 },
          },
        ],
        vehicle: { label: 'C1-23537-PLATF.(3)' },
      },
    },
    {
      id: 'entity-2',
      vehicle: {
        trip: { tripId: 'C1-23537', routeId: 'C1' },
        position: { latitude: 40.4168, longitude: -3.7038, speed: 0 },
        currentStatus: 'STOPPED_AT',
        stopId: '60000',
        label: 'C1-23537-PLATF.(3)',
        timestamp: 1700000050,
      },
    },
    {
      id: 'entity-3',
      tripUpdate: {
        trip: { tripId: 'C3-11111', routeId: 'C3' },
        stopTimeUpdate: [],
      },
    },
  ],
}

describe('parseAnden', () => {
  it('extrae el número de andén del label', () => {
    expect(parseAnden('C1-23537-PLATF.(3)')).toBe('3')
    expect(parseAnden('C4-99999-PLATF.(12)')).toBe('12')
    expect(parseAnden('C4-99999-PLATF.(A)')).toBe('A')
  })

  it('devuelve undefined cuando no hay andén en el label', () => {
    expect(parseAnden('C1-23537')).toBeUndefined()
    expect(parseAnden('')).toBeUndefined()
    expect(parseAnden('PLATF.sin-parentesis')).toBeUndefined()
  })
})

describe('resolveEstado', () => {
  it('devuelve cancelado cuando scheduleRelationship es CANCELED', () => {
    expect(resolveEstado(0, 'CANCELED')).toBe('cancelado')
    expect(resolveEstado(500, 'CANCELED')).toBe('cancelado')
  })

  it('devuelve retrasado para delay > 120s', () => {
    expect(resolveEstado(121)).toBe('retrasado')
    expect(resolveEstado(300)).toBe('retrasado')
    expect(resolveEstado(3600)).toBe('retrasado')
  })

  it('devuelve a_tiempo para delay ≤ 120s', () => {
    expect(resolveEstado(0)).toBe('a_tiempo')
    expect(resolveEstado(60)).toBe('a_tiempo')
    expect(resolveEstado(120)).toBe('a_tiempo')
  })
})

describe('indexTripUpdatesById', () => {
  it('indexa tripUpdates por tripId', () => {
    const index = indexTripUpdatesById(FEED_FIXTURE)
    expect(Object.keys(index)).toContain('C1-23537')
    expect(Object.keys(index)).toContain('C3-11111')
  })

  it('ignora entidades sin tripUpdate', () => {
    const index = indexTripUpdatesById(FEED_FIXTURE)
    // entity-2 es vehicle position, no tripUpdate
    expect(Object.keys(index)).toHaveLength(2)
  })

  it('el tripUpdate indexado tiene la estructura correcta', () => {
    const index = indexTripUpdatesById(FEED_FIXTURE)
    const trip = index['C1-23537']
    expect(trip).toBeDefined()
    expect(trip!.trip.routeId).toBe('C1')
    expect(trip!.stopTimeUpdate).toHaveLength(1)
    expect(trip!.stopTimeUpdate[0]!.stopId).toBe('60000')
  })

  it('devuelve objeto vacío para feed sin entidades', () => {
    const emptyFeed: GtfsRtFeed = { header: FEED_FIXTURE.header, entity: [] }
    expect(indexTripUpdatesById(emptyFeed)).toEqual({})
  })
})

describe('indexVehiclePositionsById', () => {
  it('indexa vehículos por tripId', () => {
    const index = indexVehiclePositionsById(FEED_FIXTURE)
    expect(Object.keys(index)).toContain('C1-23537')
  })

  it('incluye la posición GPS correcta', () => {
    const index = indexVehiclePositionsById(FEED_FIXTURE)
    const vehicle = index['C1-23537']
    expect(vehicle?.position?.latitude).toBeCloseTo(40.4168, 3)
    expect(vehicle?.position?.longitude).toBeCloseTo(-3.7038, 3)
  })

  it('ignora entidades sin vehicle', () => {
    const index = indexVehiclePositionsById(FEED_FIXTURE)
    expect(Object.keys(index)).toHaveLength(1)
  })
})

describe('fetchTripUpdates con caché', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('llama a fetch cuando la caché está vacía', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => FEED_FIXTURE,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { fetchTripUpdates } = await import('@/lib/renfe/gtfs-rt')
    const result = await fetchTripUpdates('cercanias')

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(result.stale).toBe(false)
    expect(result.feed.entity).toHaveLength(FEED_FIXTURE.entity.length)
  })

  it('marca stale: true cuando fetch falla y hay caché expirada', async () => {
    // Supabase devuelve caché expirada
    const { supabaseAdmin } = await import('@/lib/supabase/admin')
    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          data: FEED_FIXTURE,
          expires_at: new Date(Date.now() - 10000).toISOString(), // expirada
        },
        error: null,
      }),
    })

    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { fetchTripUpdates } = await import('@/lib/renfe/gtfs-rt')
    const result = await fetchTripUpdates('cercanias')

    expect(result.stale).toBe(true)
    expect(result.feed).toBeDefined()
  })
})
