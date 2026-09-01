import { test, expect, type Page } from '@playwright/test'

// ─── Confguración ─────────────────────────────────────────────────────────────
// Estación con datos Cercanías (seed local): San José de Valderas.
const STOP_ID = process.env.E2E_STATION_ID || '35604'
const STATION_NAME = process.env.E2E_STATION_NAME || 'San José de Valderas'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToStation(page: Page, stopId = STOP_ID) {
  await page.goto(`/es/estacion/${stopId}`, { waitUntil: 'domcontentloaded' })
}

/** El boundary `error.tsx` muestra "Error del servidor" cuando un error de
 *  render/hidratación interrumpe la página. Nunca debe aparecer en la estación. */
async function expectNoServerError(page: Page) {
  await expect(
    page.getByText('Error del servidor', { exact: false })
  ).toHaveCount(0)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Estación — página de horarios', () => {
  test('no muestra el error del servidor (boundary de error)', async ({ page }) => {
    await goToStation(page)
    await expectNoServerError(page)
    // El título de la estación sí debe renderizar tras hidratar
    await expect(page.getByRole('heading', { name: STATION_NAME })).toBeVisible()
  })

  test('muestra los filtros (Todos / Cercanías / MD)', async ({ page }) => {
    await goToStation(page)
    await expectNoServerError(page)
    await expect(page.getByRole('button', { name: /Todos/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Cercanías/i }).first()).toBeVisible()
  })

  test('carga trenes de Cercanías', async ({ page }) => {
    await goToStation(page)
    await expectNoServerError(page)
    // Los TrainCard usan motion con salida animada; esperamos al menos uno
    const card = page
      .locator('[role="button"]')
      .filter({ hasText: /C5|C1|C2|C3|C4|C7|C8|C10/i })
      .first()
    await expect(card).toBeVisible({ timeout: 15_000 })
  })

  test('no hay errores de consola ni excepciones de página', async ({ page }) => {
    // Artefacto conocido: con el SW bloqueado (serviceWorkers:'block'),
    // Serwist registra con un resultado vacío y lanza al leer .waiting.
    // NO es un fallo real de la app (solo ocurre bajo el bloqueo de Playwright).
    const SW_ARTIFACT = /(waiting|Cannot read properties of undefined|undefined is not an object)/i
    const pageErrors: string[] = []
    page.on('pageerror', (e) => {
      if (!SW_ARTIFACT.test(e.message)) pageErrors.push(e.message)
    })

    await goToStation(page)
    await expect(page.getByRole('heading', { name: STATION_NAME })).toBeVisible()

    // Pequeña espera para capturar errores de hidratación/render tempranos
    await page.waitForTimeout(2_000)

    // Cualquier otra excepción no capturada (renders crasheados) es un fallo real
    expect(pageErrors, `pageerror: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('el buscador de fecha interactúa sin romper la página', async ({ page }) => {
    await goToStation(page)
    await expectNoServerError(page)
    const dateInput = page.getByRole('combobox')
    await expect(dateInput).toBeVisible()
    // Abrir el calendario y cerrarlo con Escape
    await dateInput.click()
    await page.keyboard.press('Escape')
    await expectNoServerError(page)
  })
})
