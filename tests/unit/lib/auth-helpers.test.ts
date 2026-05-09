// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Must be hoisted before imports that use them
const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockSignInWithOAuth = vi.fn()
const mockSignOut = vi.fn()
const mockGetUser = vi.fn()
const mockFromSelect = vi.fn()
const mockFromUpdate = vi.fn()

const mockFrom = vi.fn((table: string) => {
  if (table === 'profiles') {
    return {
      select: () => ({
        eq: () => ({
          single: mockFromSelect,
        }),
      }),
      update: () => ({
        eq: mockFromUpdate,
      }),
    }
  }
  return {}
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}))

const mockClearUser = vi.fn()
vi.mock('@/store/userStore', () => ({
  useUserStore: {
    getState: () => ({ clearUser: mockClearUser }),
  },
}))

// Import after mocks
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  syncLocaleOnLogin,
  getCurrentUser,
} from '@/lib/supabase/auth-helpers'

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom doesn't have window.location.origin by default
  Object.defineProperty(window, 'location', {
    value: { origin: 'http://localhost:3000', pathname: '/es/' },
    writable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('signInWithEmail', () => {
  it('calls supabase.auth.signInWithPassword with email and password', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    await signInWithEmail('a@b.com', 'secret123')
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
    })
  })

  it('throws when supabase returns an error', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: null, error: new Error('Invalid') })
    await expect(signInWithEmail('a@b.com', 'wrong')).rejects.toThrow('Invalid')
  })
})

describe('signUpWithEmail', () => {
  it('calls signUp with email, password and full_name in metadata', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null })
    await signUpWithEmail('a@b.com', 'secret123', 'Ana López')
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
      options: { data: { full_name: 'Ana López' } },
    })
  })

  it('does NOT include role in metadata — role defaults to user via DB trigger', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null })
    await signUpWithEmail('a@b.com', 'pass1234', 'Test User')
    const callArgs = mockSignUp.mock.calls[0][0]
    expect(callArgs.options.data).not.toHaveProperty('role')
  })

  it('throws when supabase returns an error', async () => {
    mockSignUp.mockResolvedValue({ data: null, error: new Error('Email taken') })
    await expect(signUpWithEmail('a@b.com', 'pass1234', 'Test')).rejects.toThrow('Email taken')
  })
})

describe('signOut', () => {
  it('calls the signout API endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    mockSignOut.mockResolvedValue({ error: null })
    await signOut()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' })
    vi.unstubAllGlobals()
  })

  it('clears the Zustand user store', async () => {
    mockSignOut.mockResolvedValue({ error: null })
    await signOut()
    expect(mockClearUser).toHaveBeenCalledOnce()
  })

  it('does not throw when API call fails (handles error gracefully)', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('Network') })
    await expect(signOut()).resolves.toBeUndefined()
  })
})

describe('syncLocaleOnLogin', () => {
  it('sets NEXT_LOCALE cookie when profile has preferred_locale', async () => {
    mockFromSelect.mockResolvedValue({ data: { preferred_locale: 'ca' }, error: null })

    const cookieSpy = vi.spyOn(document, 'cookie', 'set')
    await syncLocaleOnLogin('user-123')

    expect(cookieSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_LOCALE=ca')
    )
  })

  it('does not set cookie when profile has no preferred_locale', async () => {
    mockFromSelect.mockResolvedValue({ data: { preferred_locale: null }, error: null })

    const cookieSpy = vi.spyOn(document, 'cookie', 'set')
    await syncLocaleOnLogin('user-123')

    expect(cookieSpy).not.toHaveBeenCalled()
  })
})

describe('getCurrentUser', () => {
  it('returns null user and profile when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await getCurrentUser()
    expect(result).toEqual({ user: null, profile: null })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns user and profile when authenticated', async () => {
    const fakeUser = { id: 'u1', email: 'a@b.com' }
    const fakeProfile = { id: 'u1', full_name: 'Ana', role: 'user' }
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } })
    mockFromSelect.mockResolvedValue({ data: fakeProfile, error: null })

    const result = await getCurrentUser()
    expect(result.user).toEqual(fakeUser)
    expect(result.profile).toEqual(fakeProfile)
  })
})
