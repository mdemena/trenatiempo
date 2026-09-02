import { test, expect } from '@playwright/test'
import {
  REF_STATIONS,
  REF_TRIP,
  setConsentCookie,
  expectNoServerError,
  createPageErrorCollector,
} from './helpers'

const VIAJE_URL = `/es/viaje/${REF_TRIP.id}?stopId=${REF_STATIONS.santCeloni.id}`

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Viaje — detalle del trayecto', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
  })

  test('carga la página de viaje sin error del servidor', async ({ page }) => {
    await page.goto(VIAJE_URL, { waitUntil: 'domcontentloaded' })
    await expectNoServerError(page)

    // El título del tren (código ADIF) es visible
    await expect(
      page.getByText(REF_TRIP.id, { exact: true }).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('muestra la línea temporal de paradas con stop-79104 (Sant Celoni)', async ({ page }) => {
    await page.goto(VIAJE_URL, { waitUntil: 'domcontentloaded' })

    // Espera a que se renderice la parada de Sant Celoni
    const santCeloniStop = page.locator(`[data-testid="stop-${REF_STATIONS.santCeloni.id}"]`)
    await expect(santCeloniStop).toBeVisible({ timeout: 15_000 })

    // data-estado debe ser 'actual', 'pasada' o 'futura'
    const estado = await santCeloniStop.getAttribute('data-estado')
    expect(['actual', 'pasada', 'futura']).toContain(estado)

    await expectNoServerError(page)
  })

  test('muestra "Tu parada" para Sant Celoni cuando se pasa stopId', async ({ page }) => {
    await page.goto(VIAJE_URL, { waitUntil: 'domcontentloaded' })

    const santCeloniStop = page.locator(`[data-testid="stop-${REF_STATIONS.santCeloni.id}"]`)
    await expect(santCeloniStop).toBeVisible({ timeout: 15_000 })

    // Dentro del bloque de Sant Celoni debe aparecer la etiqueta "Tu parada"
    await expect(santCeloniStop.getByText(/Tu parada/i)).toBeVisible()
  })

  test('muestra el origen y destino del tren', async ({ page }) => {
    await page.goto(VIAJE_URL, { waitUntil: 'domcontentloaded' })

    // Origen → Destino (puede usar la flecha unicode → o ->)
    await expect(page.getByText(REF_TRIP.origin).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(REF_TRIP.dest).first()).toBeVisible({ timeout: 15_000 })
  })

  test('la página no tiene errores de consola', async ({ page }) => {
    const collector = createPageErrorCollector(page)

    await page.goto(VIAJE_URL, { waitUntil: 'domcontentloaded' })
    await expect(
      page.locator(`[data-testid="stop-${REF_STATIONS.santCeloni.id}"]`)
    ).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)

    expect(collector.getErrors(), `pageerror: ${collector.getErrors().join(' | ')}`).toEqual([])
  })
})
