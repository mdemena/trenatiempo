import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSendNotification = vi.fn()
const mockSetVapidDetails = vi.fn()
const mockDelete = vi.fn()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: mockDelete,
      }),
    }),
  }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  p256dh: 'dGVzdA==',
  auth: 'dGVzdA==',
}

const FAKE_PAYLOAD = { title: 'Test', body: 'Hello' }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sendPushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockResolvedValue({ error: null })
  })

  it('sends notification successfully', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 })

    const { sendPushNotification } = await import('@/lib/push/web-push')
    await sendPushNotification(FAKE_SUB, FAKE_PAYLOAD)

    expect(mockSendNotification).toHaveBeenCalledTimes(1)
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: FAKE_SUB.endpoint,
        keys: { p256dh: FAKE_SUB.p256dh, auth: FAKE_SUB.auth },
      }),
      expect.any(String)
    )
  })

  it('deletes subscription when server responds 410 Gone', async () => {
    const error = Object.assign(new Error('Gone'), { statusCode: 410 })
    mockSendNotification.mockRejectedValue(error)

    const { sendPushNotification } = await import('@/lib/push/web-push')
    await sendPushNotification(FAKE_SUB, FAKE_PAYLOAD)

    expect(mockDelete).toHaveBeenCalledWith('endpoint', FAKE_SUB.endpoint)
  })

  it('retries up to 3 times on 429 Too Many Requests', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 })
    mockSendNotification
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ statusCode: 201 })

    const { sendPushNotification } = await import('@/lib/push/web-push')
    const promise = sendPushNotification(FAKE_SUB, FAKE_PAYLOAD)

    // Advance past backoff delays (1000ms + 2000ms)
    await vi.advanceTimersByTimeAsync(4000)
    await promise

    // Should have tried 3 times total (2 failures + 1 success)
    expect(mockSendNotification).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })

  it('gives up after 3 retries on persistent 429', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 })
    mockSendNotification.mockRejectedValue(error)

    const { sendPushNotification } = await import('@/lib/push/web-push')
    const promise = sendPushNotification(FAKE_SUB, FAKE_PAYLOAD)

    await vi.advanceTimersByTimeAsync(15000)
    await promise

    // 4 total: initial + 3 retries (attempt 0,1,2,3 — retry guard is attempt < 3)
    expect(mockSendNotification).toHaveBeenCalledTimes(4)
    // Should NOT delete subscription for 429
    expect(mockDelete).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('does not delete subscription for other error codes', async () => {
    const error = Object.assign(new Error('Server Error'), { statusCode: 500 })
    mockSendNotification.mockRejectedValue(error)

    const { sendPushNotification } = await import('@/lib/push/web-push')
    await sendPushNotification(FAKE_SUB, FAKE_PAYLOAD)

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('includes title and body in the serialized payload', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 })

    const { sendPushNotification } = await import('@/lib/push/web-push')
    await sendPushNotification(FAKE_SUB, { title: 'Retraso', body: '5 minutos' })

    const payloadArg = mockSendNotification.mock.calls[0][1] as string
    const parsed = JSON.parse(payloadArg)
    expect(parsed.title).toBe('Retraso')
    expect(parsed.body).toBe('5 minutos')
    expect(parsed.icon).toBe('/icons/icon-192.png')
  })
})
