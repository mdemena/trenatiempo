import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToHome(page: Page) {
  await page.goto('/es')
}

async function goToLogin(page: Page) {
  await page.goto('/es/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form', { state: 'visible', timeout: 15000 })
}

// ─── Unauthenticated access ───────────────────────────────────────────────────

test.describe('Unauthenticated user', () => {
  test('can access the home page', async ({ page }) => {
    await goToHome(page)
    await expect(page).toHaveURL(/\/es(\/)?$/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('can access the login page', async ({ page }) => {
    await goToLogin(page)
    await expect(page).toHaveURL(/\/es\/login/)
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('can access the registro page', async ({ page }) => {
    await page.goto('/es/registro', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/es\/registro/)
    await page.waitForSelector('form', { state: 'visible', timeout: 15000 })
  })

  test('redirects /es/perfil to login and preserves returnUrl', async ({ page }) => {
    await page.goto('/es/perfil')
    await expect(page).toHaveURL(/\/es\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get('returnUrl')).toContain('/es/perfil')
  })

  test('redirects /es/favoritos to login', async ({ page }) => {
    await page.goto('/es/favoritos')
    await expect(page).toHaveURL(/\/es\/login/)
  })

  test('redirects /es/admin to login', async ({ page }) => {
    await page.goto('/es/admin')
    await expect(page).toHaveURL(/\/es\/login/)
  })
})

// ─── Login page ───────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await goToLogin(page)
  })

  test('shows email and password fields', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('shows Google OAuth button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /google/i })
    ).toBeVisible()
  })

  test('shows link to registro page', async ({ page }) => {
    await expect(page.getByRole('link', { name: /crear cuenta|crear conta|crea un compte/i })).toBeVisible()
  })

  test('shows inline error for invalid email', async ({ page }) => {
    await page.fill('input[type="email"]', 'notanemail')
    await page.fill('input[type="password"]', 'somepassword')
    await page.getByRole('button', { name: /iniciar sesión|iniciar sesion/i }).click()
    await expect(page.locator('form p.text-red-400').first()).toBeVisible()
  })

  test('shows inline error for short password', async ({ page }) => {
    await page.fill('input[type="email"]', 'valid@email.com')
    await page.fill('input[type="password"]', 'short')
    await page.getByRole('button', { name: /iniciar sesión|iniciar sesion/i }).click()
    await expect(page.locator('form p.text-red-400').first()).toBeVisible()
  })
})

// ─── Registro page ────────────────────────────────────────────────────────────

test.describe('Registro page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/es/registro', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('form', { state: 'visible', timeout: 15000 })
  })

  test('shows all registration fields', async ({ page }) => {
    await expect(page.locator('input[autocomplete="name"]')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    const passwordFields = page.locator('input[type="password"]')
    await expect(passwordFields).toHaveCount(2)
  })

  test('shows link to login page', async ({ page }) => {
    await expect(page.getByRole('link', { name: /iniciar sesión|iniciar sesion/i })).toBeVisible()
  })

  test('shows inline error when passwords do not match', async ({ page }) => {
    await page.fill('input[autocomplete="name"]', 'Test User')
    await page.fill('input[type="email"]', 'test@example.com')
    const pwFields = page.locator('input[type="password"]')
    await pwFields.nth(0).fill('password123')
    await pwFields.nth(1).fill('different456')
    await page.getByRole('button', { name: /crear cuenta/i }).click()
    await expect(page.locator('form p.text-red-400').first()).toBeVisible()
  })

  test('admin role cannot be set via the public registration form', async ({ page }) => {
    await expect(page.locator('input[name="role"]')).toHaveCount(0)
    await expect(page.locator('input[value="admin"]')).toHaveCount(0)
  })
})

// ─── Normal user cannot access admin ─────────────────────────────────────────

test.describe('Normal user access control', () => {
  test('non-admin user redirected from /admin to home', async ({ page, context }) => {
    await page.goto('/es/admin')
    await expect(page).not.toHaveURL(/\/es\/admin$/)
  })
})
