// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopTimeline } from '@/components/viaje/StopTimeline'
import type { Parada, PosicionTren } from '@/lib/renfe/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (!values) return key
    return Object.entries(values).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, String(v)),
      key
    )
  },
  useLocale: () => 'es',
}))

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li {...props}>{children}</li>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}))

vi.mock('@/lib/utils', () => ({
  formatTime: (ts: number) => `T${ts}`,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeParada(stopId: string, overrides: Partial<Parada> = {}): Parada {
  return {
    stopId,
    nombre: `Estación ${stopId}`,
    esOrigen: false,
    esDestino: false,
    ...overrides,
  }
}

const PARADAS: Parada[] = [
  makeParada('A', { esOrigen: true }),
  makeParada('B'),
  makeParada('C'),
  makeParada('D'),
  makeParada('E', { esDestino: true }),
]

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estado(stopId: string) {
  return screen.getByTestId(`stop-${stopId}`).getAttribute('data-estado')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StopTimeline', () => {
  describe('GPS position — STOPPED_AT', () => {
    const posicion: PosicionTren = {
      lat: 40,
      lng: -3,
      stopId: 'C',
      enMovimiento: false,
    }

    beforeEach(() => {
      render(<StopTimeline paradas={PARADAS} posicionActual={posicion} />)
    })

    it('marks stops before convoy as pasada', () => {
      expect(estado('A')).toBe('pasada')
      expect(estado('B')).toBe('pasada')
    })

    it('marks the convoy stop as actual', () => {
      expect(estado('C')).toBe('actual')
    })

    it('marks stops after convoy as futura', () => {
      expect(estado('D')).toBe('futura')
      expect(estado('E')).toBe('futura')
    })

    it('renders data-pulse on the actual stop dot', () => {
      const stopEl = screen.getByTestId('stop-C')
      const pulse = stopEl.querySelector('[data-pulse="true"]')
      expect(pulse).not.toBeNull()
    })
  })

  describe('GPS position — IN_TRANSIT_TO', () => {
    const posicion: PosicionTren = {
      lat: 40,
      lng: -3,
      stopId: 'C',
      enMovimiento: true,
    }

    beforeEach(() => {
      render(<StopTimeline paradas={PARADAS} posicionActual={posicion} />)
    })

    it('marks stops before convoy as pasada', () => {
      expect(estado('A')).toBe('pasada')
      expect(estado('B')).toBe('pasada')
    })

    it('marks convoy stop and all subsequent as futura', () => {
      expect(estado('C')).toBe('futura')
      expect(estado('D')).toBe('futura')
      expect(estado('E')).toBe('futura')
    })

    it('does NOT render the pulse dot when in transit', () => {
      const stopEl = screen.getByTestId('stop-C')
      const pulse = stopEl.querySelector('[data-pulse="true"]')
      expect(pulse).toBeNull()
    })
  })

  describe('time-based fallback (no GPS)', () => {
    const NOW_S = 1_700_000_000

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      // Set now to 1h after X and Y departures, but before Z's arrival
      vi.setSystemTime((NOW_S + 3600) * 1000)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('marks stops whose departure has passed as pasada', () => {
      const paradas: Parada[] = [
        makeParada('X', { esOrigen: true, salidaProgramada: NOW_S }),
        makeParada('Y', { salidaProgramada: NOW_S + 600 }),
        makeParada('Z', { esDestino: true, llegadaProgramada: NOW_S + 7200 }),
      ]

      render(<StopTimeline paradas={paradas} />)

      expect(estado('X')).toBe('pasada')
      expect(estado('Y')).toBe('pasada')
      expect(estado('Z')).toBe('futura') // only llegada set, no salidaProgramada
    })
  })

  describe('collapsible previous stops', () => {
    it('toggle button is shown when there are stops before userStopId', () => {
      render(<StopTimeline paradas={PARADAS} userStopId="C" />)
      expect(screen.queryByTestId('toggle-previous-stops')).not.toBeNull()
    })

    it('previous stops section is hidden by default', () => {
      render(<StopTimeline paradas={PARADAS} userStopId="C" />)
      expect(screen.queryByTestId('previous-stops-section')).toBeNull()
    })

    it('previous stops section appears after clicking toggle', () => {
      render(<StopTimeline paradas={PARADAS} userStopId="C" />)
      fireEvent.click(screen.getByTestId('toggle-previous-stops'))
      expect(screen.queryByTestId('previous-stops-section')).not.toBeNull()
    })

    it('previous stops section hides again on second click', () => {
      render(<StopTimeline paradas={PARADAS} userStopId="C" />)
      const btn = screen.getByTestId('toggle-previous-stops')
      fireEvent.click(btn)
      expect(screen.queryByTestId('previous-stops-section')).not.toBeNull()
      fireEvent.click(btn)
      expect(screen.queryByTestId('previous-stops-section')).toBeNull()
    })

    it('toggle button is NOT shown when userStopId is the first stop', () => {
      render(<StopTimeline paradas={PARADAS} userStopId="A" />)
      expect(screen.queryByTestId('toggle-previous-stops')).toBeNull()
    })

    it('toggle button is NOT shown when no userStopId', () => {
      render(<StopTimeline paradas={PARADAS} />)
      expect(screen.queryByTestId('toggle-previous-stops')).toBeNull()
    })
  })

  describe('scrollIntoView', () => {
    it('scrolls the user stop into view on mount', () => {
      render(<StopTimeline paradas={PARADAS} userStopId="C" />)
      const stopEl = document.getElementById('stop-C')
      expect(stopEl?.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      })
    })

    it('does not call scrollIntoView when userStopId is absent', () => {
      render(<StopTimeline paradas={PARADAS} />)
      for (const p of PARADAS) {
        const el = document.getElementById(`stop-${p.stopId}`)
        expect(el?.scrollIntoView).not.toHaveBeenCalled()
      }
    })
  })
})
