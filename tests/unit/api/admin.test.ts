import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ─── Shared mock state ────────────────────────────────────────────────────────

const mockQuery = {
  order: vi.fn(),
  range: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}

// Each method returns `this` so calls can chain
Object.keys(mockQuery).forEach((key) => {
  ;(mockQuery as Record<string, ReturnType<typeof vi.fn>>)[key].mockReturnValue(mockQuery)
})

const mockAdminClient = {
  from: vi.fn().mockReturnValue(mockQuery),
}

// Valid RFC 4122 v4 UUIDs (version=4, variant=[89ab])
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const mockRequireAdmin = vi.fn()

vi.mock('@/lib/supabase/admin-guard', () => ({
  get requireAdmin() {
    return mockRequireAdmin
  },
}))

// next/server is available in Node, but NextResponse needs to be shimmed
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return actual
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(method: string, url: string, body?: unknown): Request {
  // Use a fake request object to avoid Node.js `duplex: 'half'` requirement
  // for readable body streams in unit tests.
  return {
    url,
    method,
    headers: new Headers(body ? { 'Content-Type': 'application/json' } : {}),
    json: async () => body ?? null,
  } as unknown as Request
}

function adminGuardOk(requesterId = ADMIN_ID) {
  mockRequireAdmin.mockResolvedValue({
    ok: true,
    adminClient: mockAdminClient,
    userId: requesterId,
  })
}

function adminGuardFail(status: 401 | 403) {
  mockRequireAdmin.mockResolvedValue({
    ok: false,
    response: NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status }
    ),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockQuery).forEach((key) => {
      ;(mockQuery as Record<string, ReturnType<typeof vi.fn>>)[key].mockReturnValue(mockQuery)
    })
    mockAdminClient.from.mockReturnValue(mockQuery)
  })

  it('returns 401 when not authenticated', async () => {
    adminGuardFail(401)
    const { GET } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('GET', 'http://localhost/api/admin/usuarios')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    adminGuardFail(403)
    const { GET } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('GET', 'http://localhost/api/admin/usuarios')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('returns paginated users with total and totalPages', async () => {
    adminGuardOk()
    mockQuery.range.mockReturnValue({
      ...mockQuery,
      // terminal call — resolves with data
      then: undefined,
    })
    // The terminal await of the query chain
    mockQuery.order.mockReturnValue({
      range: vi.fn().mockResolvedValue({
        data: [{ id: OTHER_ID, full_name: 'Test User', email: 'test@example.com' }],
        count: 1,
        error: null,
      }),
    })

    const { GET } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('GET', 'http://localhost/api/admin/usuarios?page=1')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
    expect(json.totalPages).toBe(1)
    expect(json.page).toBe(1)
    expect(json.usuarios).toHaveLength(1)
  })

  it('calculates totalPages correctly for PAGE_SIZE=25', async () => {
    adminGuardOk()
    mockQuery.order.mockReturnValue({
      range: vi.fn().mockResolvedValue({
        data: Array.from({ length: 25 }, (_, i) => ({ id: `user-${i}` })),
        count: 63,
        error: null,
      }),
    })

    const { GET } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('GET', 'http://localhost/api/admin/usuarios?page=1')
    const res = await GET(req)
    const json = await res.json()

    expect(json.total).toBe(63)
    expect(json.totalPages).toBe(3) // ceil(63/25) = 3
  })

  it('returns 400 for invalid page param', async () => {
    adminGuardOk()
    const { GET } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('GET', 'http://localhost/api/admin/usuarios?page=-1')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when supabase query errors', async () => {
    adminGuardOk()
    mockQuery.order.mockReturnValue({
      range: vi.fn().mockResolvedValue({
        data: null,
        count: null,
        error: { message: 'DB error' },
      }),
    })

    const { GET } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('GET', 'http://localhost/api/admin/usuarios')
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/admin/usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminClient.from.mockReturnValue(mockQuery)
  })

  it('returns 401 when not authenticated', async () => {
    adminGuardFail(401)
    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: OTHER_ID,
      role: 'admin',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    adminGuardFail(403)
    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: OTHER_ID,
      role: 'admin',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid body (no userId)', async () => {
    adminGuardOk()
    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', { role: 'admin' })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when neither role nor active is provided', async () => {
    adminGuardOk()
    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', { userId: OTHER_ID })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('blocks admin from changing own role (self-protection)', async () => {
    adminGuardOk(ADMIN_ID)
    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: ADMIN_ID,
      role: 'user',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toMatch(/rol/)
  })

  it('blocks admin from deactivating own account (self-protection)', async () => {
    adminGuardOk(ADMIN_ID)
    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: ADMIN_ID,
      active: false,
    })
    const res = await PATCH(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toMatch(/desactivar/)
  })

  it('allows admin to update another user role', async () => {
    adminGuardOk(ADMIN_ID)
    const updatedUser = { id: OTHER_ID, role: 'admin', active: true }
    mockQuery.update.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: updatedUser, error: null }),
        }),
      }),
    })

    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: OTHER_ID,
      role: 'admin',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.usuario.role).toBe('admin')
  })

  it('allows admin to deactivate another user', async () => {
    adminGuardOk(ADMIN_ID)
    const updatedUser = { id: OTHER_ID, role: 'user', active: false }
    mockQuery.update.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: updatedUser, error: null }),
        }),
      }),
    })

    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: OTHER_ID,
      active: false,
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.usuario.active).toBe(false)
  })

  it('returns 500 when supabase update errors', async () => {
    adminGuardOk(ADMIN_ID)
    mockQuery.update.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    })

    const { PATCH } = await import('@/app/api/admin/usuarios/route')
    const req = makeRequest('PATCH', 'http://localhost/api/admin/usuarios', {
      userId: OTHER_ID,
      active: true,
    })
    const res = await PATCH(req)
    expect(res.status).toBe(500)
  })
})
