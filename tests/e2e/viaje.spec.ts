import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  REF_STATIONS,
  setConsentCookie,
  expectNoServerError,
  createPageErrorCollector,
} from './helpers'

// ─── Referencia dinámica ───────────────────────────────────────────────────────
// El tren R11 de referencia (Barcelona-Sants → Figueres) varía cada día: los
// trip_ids cambian con el service_id (p. ej. domingos vs. lunes-viernes). En
// lugar de fijar uno que solo circula entre semana, se elige en `beforeAll`
// un R11 real de HOY en Sant Celoni y se resuelven origen/destino reales desde
// el API de viaje.

let REF_TRIP_ID = ''
let REF_ORIGIN = ''
let REF_DEST = ''

async function resolveReference(request: APIRequestContext) {
  if (REF_TRIP_ID) return

  const horariosRes = await request.get(
    `/api/renfe/horarios?stopId=${REF_STATIONS.santCeloni.id}`
  )
  expect(horariosRes.ok()).toBeTruthy()

  const data = (await horariosRes.json()) as {
    horarios?: Array<{ tripId: string; routeId?: string; destino?: string }>
  }
  // Preferir hacia la costa (Figueres/Girona/Portbou) para guardar el espíritu
  // original (Barcelona-Sants → Figueres); si no, cualquier R11 sirve.
  const entries = (data.horarios ?? []).filter(
    (h) => h.tripId && (h.routeId ?? '').toUpperCase() === 'R11'
  )
  const entry =
    entries.find((h) => /Figueres|Girona|Portbou/i.test(h.destino ?? '')) ?? entries[0]
  expect(entry, `no hay ningún tren R11 hoy en ${REF_STATIONS.santCeloni.name}`).toBeTruthy()

  const viajeRes = await request.get(
    `/api/renfe/viaje/${entry.tripId}?stopId=${REF_STATIONS.santCeloni.id}&tipo=md`
  )
  const viaje = (await viajeRes.json()) as {
    tren?: { paradas: Array<{ stopId: string; nombre: string }> }
  }
  const paradas = viaje.tren?.paradas ?? []
  expect(paradas.some((p) => p.stopId === REF_STATIONS.santCeloni.id)).toBeTruthy()

  REF_TRIP_ID = entry.tripId
  REF_ORIGIN = paradas[0].nombre
  REF_DEST = paradas[paradas.length - 1].nombre
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Viaje — detalle del trayecto', () => {
  test.beforeAll(async ({ request }) => {
    await resolveReference(request)
  })

  test.beforeEach(async ({ page }) => {
    await setConsentCookie(page)
  })

  test('carga la página de viaje sin error del servidor', async ({ page }) => {
    await page.goto(`/es/viaje/${REF_TRIP_ID}?stopId=${REF_STATIONS.santCeloni.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await expectNoServerError(page)

    // El título del tren (código ADIF) es visible
    await expect(
      page.getByText(REF_TRIP_ID, { exact: true }).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('muestra la línea temporal de paradas con stop-79104 (Sant Celoni)', async ({ page }) => {
    await page.goto(`/es/viaje/${REF_TRIP_ID}?stopId=${REF_STATIONS.santCeloni.id}`, {
      waitUntil: 'domcontentloaded',
    })

    // Espera a que se renderice la parada de Sant Celoni
    const santCeloniStop = page.locator(`[data-testid="stop-${REF_STATIONS.santCeloni.id}"]`)
    await expect(santCeloniStop).toBeVisible({ timeout: 15_000 })

    // data-estado debe ser 'actual', 'pasada' o 'futura'
    const estado = await santCeloniStop.getAttribute('data-estado')
    expect(['actual', 'pasada', 'futura']).toContain(estado)

    await expectNoServerError(page)
  })

  test('muestra "Tu parada" para Sant Celoni cuando se pasa stopId', async ({ page }) => {
    await page.goto(`/es/viaje/${REF_TRIP_ID}?stopId=${REF_STATIONS.santCeloni.id}`, {
      waitUntil: 'domcontentloaded',
    })

    const santCeloniStop = page.locator(`[data-testid="stop-${REF_STATIONS.santCeloni.id}"]`)
    await expect(santCeloniStop).toBeVisible({ timeout: 15_000 })

    // Dentro del bloque de Sant Celoni debe aparecer la etiqueta "Tu parada"
    await expect(santCeloniStop.getByText(/Tu parada/i)).toBeVisible()
  })

  test('muestra el origen y destino del tren', async ({ page }) => {
    await page.goto(`/es/viaje/${REF_TRIP_ID}?stopId=${REF_STATIONS.santCeloni.id}`, {
      waitUntil: 'domcontentloaded',
    })

    // Origen → Destino (puede usar la flecha unicode → o ->)
    await expect(page.getByText(REF_ORIGIN).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(REF_DEST).first()).toBeVisible({ timeout: 15_000 })
  })

  test('la página no tiene errores de consola', async ({ page }) => {
    const collector = createPageErrorCollector(page)

    await page.goto(`/es/viaje/${REF_TRIP_ID}?stopId=${REF_STATIONS.santCeloni.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(
      page.locator(`[data-testid="stop-${REF_STATIONS.santCeloni.id}"]`)
    ).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)

    expect(collector.getErrors(), `pageerror: ${collector.getErrors().join(' | ')}`).toEqual([])
  })
})