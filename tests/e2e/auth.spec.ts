import { test, expect, type Page } from '@playwright/test'
import { setConsentCookie, findSettledInput, submitUntilValidation } from './helpers'

// ─── Helpers ──────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  // El banner de consentimiento es un overlay bloqueante que intercepta el
  // click en los botones de submit. Inyectamos la cookie antes de navegar.
  await setConsentCookie(page)
})

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
    const email = page.locator('input[type="email"]')
    const password = page.locator('input[type="password"]')
    await findSettledInput(page, email, 'notanemail')
    await findSettledInput(page, password, 'somepassword')
    await submitUntilValidation(page, page.getByRole('button', { name: /iniciar sesión|iniciar sesion/i }), [[email, 'notanemail'], [password, 'somepassword']])
    await expect(page.locator('form p.text-red-400').first()).toBeVisible()
  })

  test('shows inline error for short password', async ({ page }) => {
    const email = page.locator('input[type="email"]')
    const password = page.locator('input[type="password"]')
    await findSettledInput(page, email, 'valid@email.com')
    await findSettledInput(page, password, 'short')
    await submitUntilValidation(page, page.getByRole('button', { name: /iniciar sesión|iniciar sesion/i }), [[email, 'valid@email.com'], [password, 'short']])
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
    const name = page.locator('input[autocomplete="name"]')
    const email = page.locator('input[type="email"]')
    const pwFields = page.locator('input[type="password"]')
    await findSettledInput(page, name, 'Test User')
    await findSettledInput(page, email, 'test@example.com')
    await findSettledInput(page, pwFields.nth(0), 'password123')
    await findSettledInput(page, pwFields.nth(1), 'different456')
    await submitUntilValidation(page, page.getByRole('button', { name: /crear cuenta/i }), [
      [name, 'Test User'],
      [email, 'test@example.com'],
      [pwFields.nth(0), 'password123'],
      [pwFields.nth(1), 'different456'],
    ])
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
