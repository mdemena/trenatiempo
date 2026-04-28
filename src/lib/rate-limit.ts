/**
 * Rate limiter in-memory con sliding window.
 * Válido para instancias de un solo proceso (serverless con cold-starts cortos).
 * Para multi-instancia, sustituir por Redis / Supabase.
 */

interface Window {
  count: number
  reset: number  // epoch ms
}

const store = new Map<string, Window>()

const DEFAULT_LIMIT = Number(process.env.API_RATE_LIMIT_RPM ?? 60)
const DEFAULT_WINDOW_MS = 60_000

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  reset: number  // epoch ms
}

export function checkRateLimit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, limit, remaining: limit - 1, reset: now + windowMs }
  }

  entry.count++
  const ok = entry.count <= limit
  return { ok, limit, remaining: Math.max(0, limit - entry.count), reset: entry.reset }
}

/** Extrae una clave identificativa de la request (IP o forward header). */
export function getRateLimitKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
  return `${prefix}:${ip}`
}
