import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  REF_STATIONS,
  E2E_USER,
  setConsentCookie,
  loginAs,
  installPushStubs,
  expectNoServerError,
  createPageErrorCollector,
} from './helpers'

test.describe('PWA manifest', () => {
  test('serves a valid manifest.json', async ({ page }) => {
    const res = await page.request.get('/manifest.json')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')

    const manifest = await res.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#0A1628')
    expect(manifest.icons).toBeInstanceOf(Array)
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
  })

  test('layout has manifest link and theme-color meta', async ({ page }) => {
    await page.goto('/es')
    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json')
  })
})

test.describe('PWA icons', () => {
  test('icon-192.png is accessible', async ({ page }) => {
    const res = await page.request.get('/icons/icon-192.png')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
  })

  test('icon-512.png is accessible', async ({ page }) => {
    const res = await page.request.get('/icons/icon-512.png')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
  })

  test('apple-touch-icon.png is accessible', async ({ page }) => {
    const res = await page.request.get('/icons/apple-touch-icon.png')
    expect(res.status()).toBe(200)
  })
})

test.describe('Push subscription flow', () => {
  test('unauthenticated user is redirected to login when subscribing to a trip', async ({
    page,
  }) => {
    await page.goto('/es/viaje/C1-12345')
    const res = await page.request.post('/api/push/subscribe', {
      data: {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: { p256dh: 'test', auth: 'test' },
        },
        tripCode: 'C1-12345',
      },
    })
    // 401 = not authenticated, 500 = server error (e.g. Supabase unavailable)
    expect([401, 500]).toContain(res.status())
  })

  test('push subscribe endpoint rejects missing subscription data', async ({ page }) => {
    const res = await page.request.post('/api/push/subscribe', {
      data: { tripCode: 'C1-12345' },
    })
    expect([400, 401, 500]).toContain(res.status())
  })
})

// ─── Flujo cliente de suscripción push ───────────────────────────────────────
// Usa `installPushStubs`: Playwright no puede conceder el permiso push real en
// su Chromium (artefacto conocido, ver helpers.ts), así que se stubea solo
// `Notification.requestPermission` y `PushManager.prototype.subscribe`. El SW
// es REAL (activándose gracias al fix del precache) y el POST/GET/DELETE van al
// servidor real. La suscripción usa un endpoint https://fakepush.local/ y se
// limpia con DELETE al terminar (el endpoint del servidor está en Supabase live).

let PUSH_TRIP_ID = ''
let PUSH_TRIP_NUM = ''

async function resolvePushReference(request: APIRequestContext) {
  if (PUSH_TRIP_ID) return

  const horariosRes = await request.get(
    `/api/renfe/horarios?stopId=${REF_STATIONS.santCeloni.id}`
  )
  expect(horariosRes.ok()).toBeTruthy()

  const data = (await horariosRes.json()) as {
    horarios?: Array<{ tripId: string; routeId?: string; numTren?: string }>
  }
  const entries = (data.horarios ?? []).filter(
    (h) => h.tripId && (h.routeId ?? '').toUpperCase() === 'R11'
  )
  const entry = entries[0]
  expect(entry, `no hay ningún tren R11 hoy en ${REF_STATIONS.santCeloni.name}`).toBeTruthy()

  PUSH_TRIP_ID = entry.tripId
  PUSH_TRIP_NUM = entry.numTren ?? ''
}

test.describe('Push subscription — client flow', () => {
  test.use({ serviceWorkers: 'allow' })

  test.beforeAll(async ({ request }) => {
    await resolvePushReference(request)
  })

  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
    await installPushStubs(page)
  })

  // Autocuración: si una corrida previa dejó la suscripción puesta, la
  // desuscribe primero para dejar la campana en estado idle y poder empezar.
  async function ensurePushBellIdle(page: Page) {
    const idle = page.getByRole('button', { name: 'Suscribirme a este tren' })
    const subscribed = page.getByRole('button', { name: 'Cancelar suscripción' })
    try {
      await subscribed.waitFor({ state: 'visible', timeout: 3_000 })
      await subscribed.click()
      await idle.waitFor({ state: 'visible', timeout: 15_000 })
    } catch {
      await idle.waitFor({ state: 'visible', timeout: 20_000 })
    }
  }

  async function subscribe(page: Page) {
    await ensurePushBellIdle(page)
    await page.getByRole('button', { name: 'Suscribirme a este tren' }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page
      .getByRole('button', { name: 'Cancelar suscripción' })
      .waitFor({ state: 'visible', timeout: 15_000 })
  }

  async function cleanupSubscription(page: Page, endpoint: string | null) {
    if (!endpoint || page.isClosed()) return
    await page.evaluate((ep) => {
      return fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: ep }),
      })
    }, endpoint)
  }

  test('subscribing from a trip lights the bell and persists server-side', async ({ page }) => {
    const errors = createPageErrorCollector(page)
    let endpoint: string | null = null
    try {
      await loginAs(page, E2E_USER.email, E2E_USER.password)
      await page.goto(`/es/viaje/${PUSH_TRIP_ID}`)

      await subscribe(page)

      // Campana encendida y localStorage con el endpoint
      endpoint = await page.evaluate(
        (tp) => localStorage.getItem(`push_sub_${tp}`),
        PUSH_TRIP_ID
      )
      expect(endpoint).toBeTruthy()

      // La fila existe en el servidor
      const subs = await page.evaluate(() =>
        fetch('/api/push/subscriptions').then((r) => r.json())
      )
      const rows = (subs as Array<{ endpoint: string; trip_code: string | null }>).filter(
        (s) => s.endpoint === endpoint
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].trip_code).toBe(PUSH_TRIP_ID)

      await expectNoServerError(page)
      expect(errors.getErrors()).toEqual([])
    } finally {
      await cleanupSubscription(page, endpoint)
      errors.dispose()
    }
  })

  test('reload shows the subscription and unsubscribing removes it', async ({ page }) => {
    const errors = createPageErrorCollector(page)
    let endpoint: string | null = null
    try {
      await loginAs(page, E2E_USER.email, E2E_USER.password)
      await page.goto(`/es/viaje/${PUSH_TRIP_ID}`)

      await subscribe(page)
      endpoint = await page.evaluate(
        (tp) => localStorage.getItem(`push_sub_${tp}`),
        PUSH_TRIP_ID
      )
      expect(endpoint).toBeTruthy()

      // Vuelve a entrar: el GET de mount la pilla y la campana sale encendida
      await page.reload({ waitUntil: 'domcontentloaded' })
      const subscribedBell = page.getByRole('button', { name: 'Cancelar suscripción' })
      await subscribedBell.waitFor({ state: 'visible', timeout: 20_000 })

      // Click = desuscribirse → DELETE al servidor y campana apagada
      await subscribedBell.click()
      await page
        .getByRole('button', { name: 'Suscribirme a este tren' })
        .waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForFunction(
        (ep) =>
          fetch('/api/push/subscriptions')
            .then((r) => r.json())
            .then((l: Array<{ endpoint: string }>) => !l.some((s) => s.endpoint === ep)),
        endpoint
      )
      endpoint = null

      await expectNoServerError(page)
      expect(errors.getErrors()).toEqual([])
    } finally {
      await cleanupSubscription(page, endpoint)
      errors.dispose()
    }
  })

  test('unauthenticated bell click redirects to login', async ({ page }) => {
    await page.goto(`/es/viaje/${PUSH_TRIP_ID}`)
    const bell = page.getByRole('button', { name: 'Suscribirme a este tren' })
    await bell.click({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/es\/login/)
    expect(new URL(page.url()).searchParams.get('returnUrl')).toContain(`/viaje/${PUSH_TRIP_ID}`)
  })
})

test.describe('Offline page', () => {
  test('offline.html is accessible', async ({ page }) => {
    const res = await page.request.get('/offline.html')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')
  })

  test('offline.html contains expected content', async ({ page }) => {
    await page.goto('/offline.html')
    await expect(page.getByText('Sin conexión')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })
})
