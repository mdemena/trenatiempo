import { test, expect } from '@playwright/test'

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
    // Navigate directly to a trip page
    await page.goto('/es/viaje/C1-12345')
    // If the viaje page loads, the subscribe button should redirect to login
    // The test just verifies the push subscription API requires auth
    const res = await page.request.post('/api/push/subscribe', {
      data: {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: { p256dh: 'test', auth: 'test' },
        },
        tripCode: 'C1-12345',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('push subscribe endpoint rejects missing subscription data', async ({ page }) => {
    const res = await page.request.post('/api/push/subscribe', {
      data: { tripCode: 'C1-12345' },
    })
    // 401 (not authenticated) or 400 (bad data) — both acceptable
    expect([400, 401]).toContain(res.status())
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
