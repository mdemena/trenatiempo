// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGeolocation } from '@/hooks/useGeolocation'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_POSITION = {
  coords: {
    latitude: 40.4063,
    longitude: -3.6892,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
} as unknown as GeolocationPosition

function makeGeoError(code: number): GeolocationPositionError {
  return {
    code,
    message: 'error',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type GeoSuccessCallback = (pos: GeolocationPosition) => void
type GeoErrorCallback = (err: GeolocationPositionError) => void

let capturedSuccess: GeoSuccessCallback | null = null
let capturedError: GeoErrorCallback | null = null

const mockGetCurrentPosition = vi.fn(
  (onSuccess: GeoSuccessCallback, onError: GeoErrorCallback) => {
    capturedSuccess = onSuccess
    capturedError = onError
  }
)

beforeEach(() => {
  capturedSuccess = null
  capturedError = null
  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition: mockGetCurrentPosition },
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useGeolocation', () => {
  it('initializes with loading=false, no error, no coords', () => {
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.loading).toBe(false)
    expect(result.current.errorCode).toBeNull()
    expect(result.current.coords).toBeNull()
  })

  describe('loading → success', () => {
    it('sets loading=true while waiting', () => {
      const { result } = renderHook(() => useGeolocation())

      act(() => result.current.getLocation())

      expect(result.current.loading).toBe(true)
      expect(result.current.errorCode).toBeNull()
      expect(result.current.coords).toBeNull()
    })

    it('sets coords on success and clears loading', () => {
      const { result } = renderHook(() => useGeolocation())

      act(() => result.current.getLocation())
      act(() => capturedSuccess!(MOCK_POSITION))

      expect(result.current.loading).toBe(false)
      expect(result.current.errorCode).toBeNull()
      expect(result.current.coords).toEqual({ lat: 40.4063, lng: -3.6892 })
    })

    it('passes timeout and maximumAge options to getCurrentPosition', () => {
      const { result } = renderHook(() => useGeolocation())
      act(() => result.current.getLocation())

      expect(mockGetCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        { timeout: 10000, maximumAge: 60000 }
      )
    })
  })

  describe('loading → error', () => {
    it('maps code 1 to permission_denied', () => {
      const { result } = renderHook(() => useGeolocation())
      act(() => result.current.getLocation())
      act(() => capturedError!(makeGeoError(1)))

      expect(result.current.loading).toBe(false)
      expect(result.current.errorCode).toBe('permission_denied')
      expect(result.current.coords).toBeNull()
    })

    it('maps code 2 to position_unavailable', () => {
      const { result } = renderHook(() => useGeolocation())
      act(() => result.current.getLocation())
      act(() => capturedError!(makeGeoError(2)))

      expect(result.current.errorCode).toBe('position_unavailable')
    })

    it('maps code 3 to timeout', () => {
      const { result } = renderHook(() => useGeolocation())
      act(() => result.current.getLocation())
      act(() => capturedError!(makeGeoError(3)))

      expect(result.current.errorCode).toBe('timeout')
    })
  })

  describe('not_supported', () => {
    it('sets not_supported when navigator.geolocation is absent', () => {
      vi.stubGlobal('navigator', { geolocation: undefined })

      const { result } = renderHook(() => useGeolocation())
      act(() => result.current.getLocation())

      expect(result.current.loading).toBe(false)
      expect(result.current.errorCode).toBe('not_supported')
      expect(result.current.coords).toBeNull()
    })
  })

  describe('state resets on retry', () => {
    it('clears previous error when getLocation is called again', () => {
      const { result } = renderHook(() => useGeolocation())

      act(() => result.current.getLocation())
      act(() => capturedError!(makeGeoError(1)))
      expect(result.current.errorCode).toBe('permission_denied')

      act(() => result.current.getLocation())
      expect(result.current.loading).toBe(true)
      expect(result.current.errorCode).toBeNull()
    })

    it('clears previous coords when getLocation is called again', () => {
      const { result } = renderHook(() => useGeolocation())

      act(() => result.current.getLocation())
      act(() => capturedSuccess!(MOCK_POSITION))
      expect(result.current.coords).not.toBeNull()

      act(() => result.current.getLocation())
      expect(result.current.loading).toBe(true)
      expect(result.current.coords).toBeNull()
    })
  })
})
