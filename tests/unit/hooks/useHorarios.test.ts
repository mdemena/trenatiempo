// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHorarios } from '@/hooks/useHorarios'
import type { HorarioEntry, HorariosResponse } from '@/lib/renfe/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTren(
  salidaProgramada: string,
  overrides: Partial<HorarioEntry> = {}
): HorarioEntry {
  return {
    tripId: `trip-${salidaProgramada}`,
    routeId: 'C1',
    tipo: 'cercanias',
    salidaProgramada,
    delaySeg: 0,
    cancelado: false,
    estado: 'a_tiempo',
    ...overrides,
  }
}

function makeResponse(horarios: HorarioEntry[], stale = false): HorariosResponse {
  return { horarios, updatedAt: Date.now(), stale }
}

function mockFetch(responses: Record<string, HorariosResponse>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const tipo = new URL(url, 'http://x').searchParams.get('tipo') ?? 'cercanias'
      const data = responses[tipo] ?? makeResponse([])
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    })
  )
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // shouldAdvanceTime lets waitFor retry via real time while we still control intervals
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useHorarios', () => {
  describe('initial state', () => {
    it('starts with loading=false and empty trenes', () => {
      mockFetch({ cercanias: makeResponse([]) })
      const { result } = renderHook(() => useHorarios(null))
      expect(result.current.loading).toBe(false)
      expect(result.current.trenes).toHaveLength(0)
      expect(result.current.error).toBe(false)
    })
  })

  describe('future train filtering', () => {
    beforeEach(() => {
      // Fix local time to noon
      vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0))
    })

    it('shows only trains departing after current time', async () => {
      mockFetch({
        cercanias: makeResponse([
          makeTren('08:00:00'), // past — should be filtered out
          makeTren('20:00:00'), // future — should appear
        ]),
      })

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.trenes).toHaveLength(1)
      expect(result.current.trenes[0]?.salidaProgramada).toBe('20:00:00')
    })

    it('uses salidaReal for filtering when train is delayed', async () => {
      // Scheduled at 11:30 but real departure 12:30 — should appear
      mockFetch({
        cercanias: makeResponse([
          makeTren('11:30:00', { salidaReal: '12:30:00', delaySeg: 3600, estado: 'retrasado' }),
        ]),
      })

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.trenes).toHaveLength(1)
      expect(result.current.trenes[0]?.salidaReal).toBe('12:30:00')
    })

    it('filters delayed train whose real departure is also past', async () => {
      // Scheduled 10:00, real 11:00 — both before noon
      mockFetch({
        cercanias: makeResponse([
          makeTren('10:00:00', { salidaReal: '11:00:00', delaySeg: 3600, estado: 'retrasado' }),
        ]),
      })

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.trenes).toHaveLength(0)
    })
  })

  describe('tipo filtering', () => {
    it('calls cercanias endpoint when tipo=cercanias', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeResponse([])),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      const url = fetchMock.mock.calls[0]?.[0] as string
      expect(url).toContain('tipo=cercanias')
      expect(url).not.toContain('tipo=md')
    })

    it('calls md endpoint when tipo=md', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeResponse([])),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useHorarios('60000', 'md'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      const url = fetchMock.mock.calls[0]?.[0] as string
      expect(url).toContain('tipo=md')
    })

    it('calls both endpoints when tipo=all and merges sorted by time', async () => {
      vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0))
      const fetchMock = vi.fn((url: string) => {
        const tipo = new URL(url, 'http://x').searchParams.get('tipo')
        const tren =
          tipo === 'cercanias'
            ? makeTren('16:00:00', { routeId: 'C1', tipo: 'cercanias' })
            : makeTren('14:00:00', { routeId: 'MD1', tipo: 'md' })
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeResponse([tren])),
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useHorarios('60000', 'all'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result.current.trenes).toHaveLength(2)
      // sorted by salidaProgramada ascending
      expect(result.current.trenes[0]?.salidaProgramada).toBe('14:00:00')
      expect(result.current.trenes[1]?.salidaProgramada).toBe('16:00:00')
    })

    it('tags entries with tipo when fetching all', async () => {
      vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0))
      mockFetch({
        cercanias: makeResponse([makeTren('15:00:00', { routeId: 'C1', tipo: 'cercanias' })]),
        md: makeResponse([makeTren('16:00:00', { routeId: 'MD1', tipo: 'md' })]),
      })

      const { result } = renderHook(() => useHorarios('60000', 'all'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      const cercanias = result.current.trenes.find((t) => t.routeId === 'C1')
      const md = result.current.trenes.find((t) => t.routeId === 'MD1')
      expect(cercanias?.tipo).toBe('cercanias')
      expect(md?.tipo).toBe('md')
    })
  })

  describe('stale data behavior', () => {
    it('marks stale=true when API returns stale flag', async () => {
      vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0))
      mockFetch({ cercanias: makeResponse([makeTren('20:00:00')], true) })

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.stale).toBe(true)
    })

    it('keeps previous trenes and sets error=true when fetch fails', async () => {
      vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0))
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(makeResponse([makeTren('20:00:00')])),
        })
        .mockRejectedValueOnce(new Error('Network error'))

      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.trenes).toHaveLength(1))

      // Advance the interval and process resulting async operations
      await vi.advanceTimersByTimeAsync(20_000)
      await waitFor(() => expect(result.current.error).toBe(true))

      expect(result.current.trenes).toHaveLength(1)
      expect(result.current.stale).toBe(true)
    })

    it('sets updatedAt from API response', async () => {
      const fixedAt = 1705320000000
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ horarios: [], updatedAt: fixedAt, stale: false }),
      }))

      const { result } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(result.current.updatedAt).not.toBeNull())

      expect(result.current.updatedAt).toBe(fixedAt)
    })
  })

  describe('auto-refresh', () => {
    it('uses 20s interval for cercanias', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeResponse([])),
      })
      vi.stubGlobal('fetch', fetchMock)

      renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(20_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not refresh md before 30s', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeResponse([])),
      })
      vi.stubGlobal('fetch', fetchMock)

      renderHook(() => useHorarios('60000', 'md'))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      // At 20s: still only the initial call
      await vi.advanceTimersByTimeAsync(20_000)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // At 30s: second call fires
      await vi.advanceTimersByTimeAsync(10_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('clears interval on unmount', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeResponse([])),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { unmount } = renderHook(() => useHorarios('60000', 'cercanias'))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      unmount()
      await vi.advanceTimersByTimeAsync(20_000)

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
