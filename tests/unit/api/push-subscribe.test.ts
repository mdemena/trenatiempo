import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockUpsert = vi.fn()

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

function makeClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user }, error: user ? null : { message: 'No user' } }),
    },
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
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

  it('acepta flags explícitos y guarda station_id', async () => {
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
        station_id: '79104',
        notify_delay: true,
        notify_arrival: true,
        service_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      { onConflict: 'user_id,endpoint,trip_code' }
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

  it('rechaza serviceDate futura', async () => {
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
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteChain.length = 0
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
})