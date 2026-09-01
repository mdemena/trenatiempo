import { test, expect, type Page } from '@playwright/test'
import {
  REF_STATIONS,
  setConsentCookie,
  expectNoServerError,
  createPageErrorCollector,
} from './helpers'

// ─── Configuración ────────────────────────────────────────────────────────────
// Estación Cercanías de referencia (seed local): San José de Valderas.
const STOP_ID = process.env.E2E_STATION_ID || '35604'
const STATION_NAME = process.env.E2E_STATION_NAME || 'San José de Valderas'
const CERCANIAS_REGEX = /C5|C1|C2|C3|C4|C7|C8|C10/i

// Líneas R (Cercanías / MD) que se esperan en las estaciones del área Granollers/Selva.
const ROUTE_R_REGEX = /R2|R2N|R8|R11|R13|R4/i

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToStation(page: Page, stopId = STOP_ID) {
  await page.goto(`/es/estacion/${stopId}`, { waitUntil: 'domcontentloaded' })
}

async function waitForStationHeading(page: Page, name: string) {
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 })
}

async function waitForTrainCards(page: Page, routeRegex: RegExp) {
  const card = page
    .locator('[role="button"]')
    .filter({ hasText: routeRegex })
    .first()
  await expect(card).toBeVisible({ timeout: 15_000 })
}

// ─── Tests — Estación default ────────────────────────────────────────────────

test.describe('Estación — página de horarios', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
  })

  test('no muestra el error del servidor (boundary de error)', async ({ page }) => {
    await goToStation(page)
    await expectNoServerError(page)
    await waitForStationHeading(page, STATION_NAME)
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
    await waitForTrainCards(page, CERCANIAS_REGEX)
  })

  test('no hay errores de consola ni excepciones de página', async ({ page }) => {
    const collector = createPageErrorCollector(page)

    await goToStation(page)
    await waitForStationHeading(page, STATION_NAME)
    await page.waitForTimeout(2_000)

    expect(collector.getErrors(), `pageerror: ${collector.getErrors().join(' | ')}`).toEqual([])
  })

  test('el buscador de fecha interactúa sin romper la página', async ({ page }) => {
    await goToStation(page)
    await expectNoServerError(page)
    const dateInput = page.getByRole('combobox')
    await expect(dateInput).toBeVisible()
    await dateInput.click()
    await page.keyboard.press('Escape')
    await expectNoServerError(page)
  })
})

// ─── Tests — Sant Celoni (79104) ──────────────────────────────────────────────
// Cercanías R2/R2N/R11 + Regional R11. R11 es Media Distancia (a tiempo → Figueres).

test.describe('Estación — Sant Celoni (79104)', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
  })

  test('carga sin error del servidor y muestra el nombre', async ({ page }) => {
    await goToStation(page, REF_STATIONS.santCeloni.id)
    await expectNoServerError(page)
    await waitForStationHeading(page, REF_STATIONS.santCeloni.name)
  })

  test('muestra los filtros (Todos / Cercanías / Media Distancia)', async ({ page }) => {
    await goToStation(page, REF_STATIONS.santCeloni.id)
    await expectNoServerError(page)
    await expect(page.getByRole('button', { name: /Todos/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Cercanías/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Media Distancia/i }).first()).toBeVisible()
  })

  test('carga trenes con líneas R (R2, R2N, R11)', async ({ page }) => {
    await goToStation(page, REF_STATIONS.santCeloni.id)
    await expectNoServerError(page)
    await waitForTrainCards(page, ROUTE_R_REGEX)
  })

  test('no hay errores de consola', async ({ page }) => {
    const collector = createPageErrorCollector(page)

    await goToStation(page, REF_STATIONS.santCeloni.id)
    await waitForStationHeading(page, REF_STATIONS.santCeloni.name)
    await page.waitForTimeout(2_000)

    expect(collector.getErrors(), `pageerror: ${collector.getErrors().join(' | ')}`).toEqual([])
  })
})

// ─── Tests — Granollers Centre (79100) ────────────────────────────────────────
// Cercanías R2/R2N/R8. R8 dirección Castelldefels / Martorell.

test.describe('Estación — Granollers Centre (79100)', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
  })

  test('carga sin error del servidor y muestra el nombre', async ({ page }) => {
    await goToStation(page, REF_STATIONS.granollersCentre.id)
    await expectNoServerError(page)
    await waitForStationHeading(page, REF_STATIONS.granollersCentre.name)
  })

  test('muestra los filtros (Todos / Cercanías)', async ({ page }) => {
    await goToStation(page, REF_STATIONS.granollersCentre.id)
    await expectNoServerError(page)
    await expect(page.getByRole('button', { name: /Todos/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Cercanías/i }).first()).toBeVisible()
  })

  test('carga trenes de Cercanías (R2, R2N, R8)', async ({ page }) => {
    await goToStation(page, REF_STATIONS.granollersCentre.id)
    await expectNoServerError(page)
    await waitForTrainCards(page, ROUTE_R_REGEX)
  })

  test('no hay errores de consola', async ({ page }) => {
    const collector = createPageErrorCollector(page)

    await goToStation(page, REF_STATIONS.granollersCentre.id)
    await waitForStationHeading(page, REF_STATIONS.granollersCentre.name)
    await page.waitForTimeout(2_000)

    expect(collector.getErrors(), `pageerror: ${collector.getErrors().join(' | ')}`).toEqual([])
  })
})
