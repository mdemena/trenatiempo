// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HomeClient } from '@/components/estacion/HomeClient'
import { useUserStore } from '@/store/userStore'
import type { Estacion } from '@/lib/renfe/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const tMock = vi.fn((key: string) => key)

vi.mock('next-intl', () => ({
  useTranslations: () => tMock,
  useLocale: () => 'es',
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    section: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <section {...props}>{children}</section>
    ),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul {...props}>{children}</ul>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('@/components/ui/Spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

vi.mock('@/components/estacion/StationSearch', () => ({
  StationSearch: () => <div data-testid="station-search" />,
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RECENT: Estacion[] = [
  { id: 'r1', name: 'Recente 1', lat: 0, lng: 0, types: ['cercanias'] },
  { id: 'r2', name: 'Recente 2', lat: 0, lng: 0, types: ['cercanias'] },
]

const FAVS: Estacion[] = [
  { id: 'f1', name: 'Favorita 1', lat: 0, lng: 0, types: ['md'] },
]

function mockUserStore(user: unknown) {
  useUserStore.setState({ user: user as never, profile: null })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HomeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows recent stations without tabs for anonymous users', () => {
    mockUserStore(null)
    localStorage.setItem(
      'trenatiempo_recent_stations',
      JSON.stringify(RECENT)
    )
    render(<HomeClient />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByText('Recente 1')).toBeTruthy()
  })

  it('shows the double tab bar when the user is logged in', () => {
    mockUserStore({ id: 'user-1' })
    localStorage.setItem(
      'trenatiempo_recent_stations',
      JSON.stringify(RECENT)
    )
    render(<HomeClient />)
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /home.recentStations/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /home.favoritesTab/ })).toBeTruthy()
    expect(screen.getByText('Recente 1')).toBeTruthy()
  })

  it('shows favorite stations when the favorites tab is selected', async () => {
    mockUserStore({ id: 'user-1' })
    const { useFavoritesStore } = await import('@/store/favoritesStore')
    useFavoritesStore.setState({ stations: FAVS, loaded: true, loading: false })

    render(<HomeClient />)
    fireEvent.click(screen.getByRole('tab', { name: /home.favoritesTab/ }))

    expect(screen.getByText('Favorita 1')).toBeTruthy()
    expect(screen.queryByText('Recente 1')).not.toBeTruthy()
  })

  it('shows an empty state for favorites without favorites', async () => {
    mockUserStore({ id: 'user-1' })
    const { useFavoritesStore } = await import('@/store/favoritesStore')
    useFavoritesStore.setState({ stations: [], loaded: true, loading: false })

    render(<HomeClient />)
    fireEvent.click(screen.getByRole('tab', { name: /home.favoritesTab/ }))

    expect(screen.getByText('home.noFavorites')).toBeTruthy()
  })
})
