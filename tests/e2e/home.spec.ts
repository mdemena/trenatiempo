import { test, expect, type Page } from '@playwright/test'
import {
  REF_STATIONS,
  setConsentCookie,
  expectNoServerError,
  createPageErrorCollector,
  searchStation,
} from './helpers'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Navega a la home y espera el input de búsqueda. La hidratación se gestiona
 *  dentro de searchStation (autocuración ante el reset de valor). */
async function goToHome(page: Page) {
  await page.goto('/es', { waitUntil: 'domcontentloaded' })
  const searchInput = page.getByRole('combobox', { name: 'Buscar estación...' })
  await expect(searchInput).toBeVisible()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Home — búsqueda de estación', () => {
  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
  })

  test('carga la página con el buscador y el selector de fecha', async ({ page }) => {
    await goToHome(page)
    await expectNoServerError(page)

    // Combobox de búsqueda de estación (disambiguated by accessible name)
    const searchInput = page.getByRole('combobox', { name: 'Buscar estación...' })
    await expect(searchInput).toBeVisible()

    // DatePicker combobox (Fecha de viaje)
    const dateInput = page.getByRole('combobox', { name: 'Fecha de viaje' })
    await expect(dateInput).toBeVisible()
  })

  test('busca "Granollers" y muestra las 3 estaciones esperadas', async ({ page }) => {
    await goToHome(page)
    await expectNoServerError(page)

    const searchInput = page.getByRole('combobox', { name: 'Buscar estación...' })
    await searchStation(page, searchInput, 'Granollers')

    const options = page.getByRole('option')
    const texts = await options.allInnerTexts()
    expect(texts.length).toBeGreaterThanOrEqual(3)
    expect(texts.some((t) => t.includes(REF_STATIONS.granollersCentre.name))).toBeTruthy()
    expect(texts.some((t) => t.includes(REF_STATIONS.granollersCanovelles.name))).toBeTruthy()
    expect(texts.some((t) => t.includes(REF_STATIONS.granollersNord.name))).toBeTruthy()
  })

  test('selecciona Granollers Centre y navega a la página de estación', async ({ page }) => {
    await goToHome(page)
    await expectNoServerError(page)

    const searchInput = page.getByRole('combobox', { name: 'Buscar estación...' })
    await searchStation(page, searchInput, 'Granollers')

    const firstOption = page.getByRole('option').first()
    await expect(firstOption).toBeVisible({ timeout: 10_000 })
    await firstOption.click()

    // Navega a la página de estación
    await page.waitForURL(new RegExp(`/es/estacion/${REF_STATIONS.granollersCentre.id}`), {
      timeout: 10_000,
    })
    expect(page.url()).toContain(`/es/estacion/${REF_STATIONS.granollersCentre.id}`)

    // La página de estación carga correctamente
    await expect(
      page.getByRole('heading', { name: REF_STATIONS.granollersCentre.name })
    ).toBeVisible({ timeout: 15_000 })
    await expectNoServerError(page)
  })

  test('no hay errores de consola ni excepciones de página', async ({ page }) => {
    const collector = createPageErrorCollector(page)

    await goToHome(page)
    await page.waitForTimeout(2_000)

    expect(collector.getErrors(), `pageerror: ${collector.getErrors().join(' | ')}`).toEqual([])
  })
})