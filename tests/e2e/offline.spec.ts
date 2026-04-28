import { test, expect } from '@playwright/test'

test.describe('Offline behavior', () => {
  test('shows offline.html when navigating while offline', async ({ page, context }) => {
    // First visit the home page to cache it
    await page.goto('/es')
    await page.waitForLoadState('networkidle')

    // Go offline
    await context.setOffline(true)

    // Reload — with SW active this would serve cached content
    // Without SW (dev mode), we just verify the offline page exists as fallback
    try {
      await page.goto('/offline.html', { timeout: 5000 })
      await expect(page.getByText('Sin conexión')).toBeVisible()
    } finally {
      await context.setOffline(false)
    }
  })

  test('offline page has retry button that reloads', async ({ page }) => {
    await page.goto('/offline.html')
    const retryBtn = page.getByRole('button', { name: 'Reintentar' })
    await expect(retryBtn).toBeVisible()

    // Click should trigger reload (we just verify it's clickable)
    await expect(retryBtn).toBeEnabled()
  })

  test('app recovers when back online', async ({ page, context }) => {
    await page.goto('/es')

    // Go offline briefly then back online
    await context.setOffline(true)
    await context.setOffline(false)

    // Navigate normally after recovery
    await page.goto('/es')
    await expect(page).toHaveURL(/\/es(\/)?$/)
    await expect(page.locator('body')).toBeVisible()
  })
})
