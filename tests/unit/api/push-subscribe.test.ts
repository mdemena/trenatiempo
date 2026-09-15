import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockUpsert = vi.fn()
let mockPatchArg: unknown = undefined
const mockPatchChain: Array<{
  eq: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}> = []

function makeChain() {
  const selectDelete = vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }], error: null })
  const eq = vi.fn(() => chain)
  const chain = {
    eq,
    select: selectDelete,
  }
  mockDeleteChain.push(chain)
  return chain
}

const mockDeleteChain: Array<{ eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> }> = []

function makePatchChain() {
  const selectPatch = vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }], error: null })
  const eq = vi.fn(() => chain)
  const chain = {
    eq,
    select: selectPatch,
  }
  mockPatchChain.push(chain)
  return chain
}

function makeClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user }, error: user ? null : { message: 'No user' } }),
    },
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
      update: (patch: unknown) => {
        mockPatchArg = patch
        return makePatchChain()
      },
      delete: () => makeChain(),
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FAKE_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/e2e',
  keys: { p256dh: 'cA==', auth: 'bQ==' },
}

function makeRequest(method: string, url: string, body?: unknown): Request {
  return {
    url,
    method,
    headers: new Headers(body ? { 'Content-Type': 'application/json' } : {}),
    json: async () => body ?? null,
  } as unknown as Request
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteChain.length = 0
    vi.mocked(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeClient({ id: USER_ID })
    )
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('devuelve 401 sin sesión', async () => {
    vi.mocked(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeClient(null))
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: 'C1-1',
      })
    )
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('acepta flags explícitos y guarda identidad de tren derivada', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: '5142X15734R11',
        stationId: '79104',
        notifyDelay: true,
        notifyArrival: true,
      })
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        endpoint: FAKE_SUB.endpoint,
        trip_code: '5142X15734R11',
        train_number: '15734',
        route_id: 'R11',
        station_id: '79104',
        notify_delay: true,
        notify_arrival: true,
        service_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      { onConflict: 'user_id,endpoint,train_number,route_id' }
    )
  })

  it('acepta identidad explícita trainNumber+routeId', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: '5154D15726R11',
        trainNumber: '15726',
        routeId: 'R11',
        notifyDelay: true,
        notifyArrival: false,
      })
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ train_number: '15726', route_id: 'R11' }),
      expect.anything()
    )
  })

  it('sin flags: retraso sí, llegada solo si hay estación', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')

    await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: 'C1-1',
        stationId: '79104',
      })
    )
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ notify_delay: true, notify_arrival: true }),
      expect.anything()
    )

    await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: 'C1-2',
      })
    )
    expect(mockUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ notify_delay: true, notify_arrival: false }),
      expect.anything()
    )
  })

  it('rechaza sin ningún tipo de aviso', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: 'C1-1',
        notifyDelay: false,
        notifyArrival: false,
      })
    )
    expect(res.status).toBe(400)
  })

  it('rechaza aviso de llegada sin estación', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: 'C1-1',
        notifyArrival: true,
      })
    )
    expect(res.status).toBe(400)
  })

  it('rechaza sin tripCode ni identidad de tren', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        endpoint: FAKE_SUB.endpoint,
        notifyDelay: true,
        notifyArrival: false,
      })
    )
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('acepta serviceDate futura (la suscripción es al tren, no a la corrida)', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/push/subscribe', {
        subscription: FAKE_SUB,
        tripCode: 'C1-1',
        stationId: '79104',
        notifyDelay: true,
        notifyArrival: false,
        serviceDate: '2999-01-01',
      })
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ service_date: '2999-01-01' }),
      expect.anything()
    )
  })
})

describe('DELETE /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteChain.length = 0
    mockPatchChain.length = 0
    vi.mocked(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeClient({ id: USER_ID })
    )
  })

  it('borra solo la fila del tren cuando llega tripCode', async () => {
    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
        tripCode: '5142X15734R11',
      })
    )
    expect(res.status).toBe(200)
    const chain = mockDeleteChain[0]
    expect(chain.eq).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(chain.eq).toHaveBeenCalledWith('trip_code', '5142X15734R11')
    expect(chain.select).toHaveBeenCalledWith('id')
  })

  it('sin tripCode borra todas las del endpoint (compat)', async () => {
    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/push/subscribe', { endpoint: FAKE_SUB.endpoint })
    )
    expect(res.status).toBe(200)
    const chain = mockDeleteChain[0]
    expect(chain.eq).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(chain.eq).not.toHaveBeenCalledWith('trip_code', expect.anything())
  })

  it('borra por identidad de tren (trainNumber+routeId)', async () => {
    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
        trainNumber: '15726',
        routeId: 'R11',
      })
    )
    expect(res.status).toBe(200)
    const chain = mockDeleteChain[0]
    expect(chain.eq).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(chain.eq).toHaveBeenCalledWith('train_number', '15726')
    expect(chain.eq).toHaveBeenCalledWith('route_id', 'R11')
    expect(chain.eq).not.toHaveBeenCalledWith('trip_code', expect.anything())
  })

  it('borra por trainNumber sin routeId (MD sin línea)', async () => {
    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
        trainNumber: '001921',
      })
    )
    expect(res.status).toBe(200)
    const chain = mockDeleteChain[0]
    expect(chain.eq).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(chain.eq).toHaveBeenCalledWith('train_number', '001921')
    expect(chain.eq).not.toHaveBeenCalledWith('route_id', expect.anything())
    expect(chain.eq).not.toHaveBeenCalledWith('trip_code', expect.anything())
  })
})

describe('PATCH /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteChain.length = 0
    mockPatchChain.length = 0
    mockPatchArg = undefined
    vi.mocked(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeClient({ id: USER_ID })
    )
  })

  it('devuelve 401 sin sesión', async () => {
    vi.mocked(createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeClient(null))
    const { PATCH } = await import('@/app/api/push/subscribe/route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
        trainNumber: '15726',
        routeId: 'R11',
        notifyDelay: false,
        notifyArrival: true,
      })
    )
    expect(res.status).toBe(401)
    expect(mockPatchChain.length).toBe(0)
  })

  it('actualiza preferencias por identidad de tren sin recrear la fila', async () => {
    mockPatchArg = undefined
    const { PATCH } = await import('@/app/api/push/subscribe/route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
        trainNumber: '15726',
        routeId: 'R11',
        notifyDelay: false,
        notifyArrival: true,
      })
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockPatchArg).toEqual({ notify_delay: false, notify_arrival: true })
    const chain = mockPatchChain[0]
    expect(chain.eq).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(chain.eq).toHaveBeenCalledWith('train_number', '15726')
    expect(chain.eq).toHaveBeenCalledWith('route_id', 'R11')
    expect(chain.select).toHaveBeenCalledWith('id')
  })

  it('actualiza con tripCode para filas legacy', async () => {
    const { PATCH } = await import('@/app/api/push/subscribe/route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
        tripCode: '5142X15734R11',
        notifyDelay: true,
        notifyArrival: false,
      })
    )
    expect(res.status).toBe(200)
    const chain = mockPatchChain[0]
    expect(chain.eq).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(chain.eq).toHaveBeenCalledWith('trip_code', '5142X15734R11')
    expect(chain.eq).not.toHaveBeenCalledWith('train_number', expect.anything())
  })

  it('rechaza sin campo a actualizar ni tren', async () => {
    const { PATCH } = await import('@/app/api/push/subscribe/route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/push/subscribe', {
        endpoint: FAKE_SUB.endpoint,
      })
    )
    expect(res.status).toBe(400)
    expect(mockPatchChain.length).toBe(0)
  })
})