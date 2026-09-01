import { expect, type Page, type TestInfo } from '@playwright/test'
import { BASE_URL, BASE_ORIGIN } from './base'

// ─── Estaciones de referencia ─────────────────────────────────────────────────
// Estaciones del área Granollers / la Selva que el usuario conoce y puede
// validar contra los horarios reales de Renfe.
export const REF_STATIONS = {
  santCeloni: { id: '79104', name: 'Sant Celoni' },
  granollersCentre: { id: '79100', name: 'Granollers Centre' },
  granollersCanovelles: { id: '77006', name: 'Granollers-Canovelles' },
  granollersNord: { id: '79109', name: 'Les Franqueses-Granollers Nord' },
} as const

// Tren R11 de ejemplo: Barcelona-Sants → Figueres pasando por Sant Celoni.
export const REF_TRIP = {
  id: '5142M15734R11',
  origin: 'Barcelona-Sants',
  dest: 'Figueres',
} as const

export const CONSENT_COOKIE = 'trenatiempo_consent'

/** Regex que captura las líneas de Cercanías / MD del área. */
export const ROUTE_REGEX = /R2|R2N|R8|R11|R13|REGIONAL|R4/i

/**
 * Artefacto conocido en E2E: con el SW bloqueado (serviceWorkers:'block'),
 * Serwist lanza un pageerror al leer `_registration.waiting`. NO es un fallo
 * real de la app. En dev, Turbopack/HMR también emite ChunkLoadError al navegar.
 * Ambos se filtran aquí para no romper el test.
 */
export const SW_ARTIFACT =
  /(waiting|Cannot read properties of undefined|undefined is not an object|ChunkLoadError|Failed to load chunk)/i

/**
 * El banner de consentimiento de cookies es un overlay bloqueante (z-100) que
 * intercepta los clics. Para tests de pantalla, lo saltamos inyectando la
 * cookie de consentimiento ANTES de navegar, así nunca aparece.
 *
 * Se llama en test.beforeEach y usa el context del test (ya tiene el cookie
 * jar correcto del browser context de Playwright).
 */
export async function setConsentCookie(page: Page, choice: 'essential' | 'analytics' = 'analytics') {
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: choice,
      url: BASE_URL,
    },
  ])
}

/**
 * Escribe `query` en el buscador y espera a que aparezcan opciones en el
 * listbox, autoreparándose si React aún no ha hidratado el input.
 *
 * Hasta que React monta su `onChange`, `fill()` escribe un valor que luego se
 * reinicia a '' (por eso a veces no llegaba ninguna petición a `/api`). En
 * lugar de esperar a la hidratación con un timeout arbitrario, rellenamos la
 * query cada vez que el valor se pierde (o cada 2s) y comprobamos en un bucle
 * que las opciones acaban apareciendo. Robusto bajo carga paralela del dev
 * server (compilación cold de Turbopack).
 */
export async function searchStation(
  page: Page,
  input: import('@playwright/test').Locator,
  query: string
) {
  const deadline = Date.now() + 15_000
  let lastFill = -99_999
  // Bucle tan pronto consume localtime, evitando timeouts dependientes de timing
  while (Date.now() < deadline) {
    if ((await input.inputValue()) !== query || Date.now() - lastFill > 2_000) {
      await input.fill(query)
      lastFill = Date.now()
    }
    try {
      await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 500 })
      return
    } catch {
      // No aparecieron opciones: puede que el valor se haya reseteado (no
      // hidratado) o que el fetch siga procesándose. Repetimos el bucle.
    }
  }
  // Último intento con el matcher normal para tener un error legible
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
}

/** El boundary `error.tsx` muestra "Error del servidor" cuando un error de
 *  render/hidratación interrumpe la página. Nunca debe aparecer. */
export async function expectNoServerError(page: Page) {
  await expect(page.getByText('Error del servidor', { exact: false })).toHaveCount(0)
}

/**
 * Rellena un input controlado ESCRIBIENDO (eventos `input` reales) y espera a
 * que React hidrate y su `onChange` lo sincronice a `value`.
 *
 * Por qué no `fill()`: escribe el .value del DOM directamente, pero en un input
 * controlado React lo deshace en el siguiente render porque su ESTADO interno
 * sigue siendo `''`. Resultado: un submit posterior valida un `''` y la UI no
 * muestra el error esperado (fallos de auth en WebKit). `pressSequentially`
 * emite eventos `input` sintéticos que el `onChange` de React SÍ procesa y
 * propaga a su estado, de modo que el valor queda de verdad en React.
 *
 * Antes de la hidratación escribir se resetea a '' — igual que `searchStation`,
 * esta función reintenta hasta que el valor ESCRIBIDO se mantiene en React
 * (señal de que onChange ya está montado y el estado quedó sincronizado).
 */
export async function findSettledInput(
  page: Page,
  locator: import('@playwright/test').Locator,
  value: string
) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await locator.fill('')
    await locator.pressSequentially(value, { delay: 5 })
    let settled = false
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(120)
      if ((await locator.inputValue()) === value) {
        settled = true
        break
      }
    }
    if (settled) {
      // Doble confirmación para no adelantarnos a una hidratación tardía.
      await page.waitForTimeout(150)
      if ((await locator.inputValue()) === value) return
    }
  }
  // Último intento con el matcher normal para tener un error legible
  await expect(locator).toHaveValue(value, { timeout: 5_000 })
}

/**
 * Espera a que el submit del cliente haya montado su `onSubmit` y luego valida.
 *
 * Tras `findSettledInput` (estado de React ya sincronizado), el primer click aún
 * puede caer ANTES de que el `onSubmit` del form esté enganchado (race de
 * paralelismo) y derivar en un submit NATIVO a `/login?`. Autocuramos: si el
 * error inline no aparece, reintentamos el click (el estado de React ya está
 * sincronizado), recargando y re-escribiendo solo si el submit nativo navegó.
 *
 * @param fields pares [locator, valor original] por si hay que re-sincronizar.
 */
export async function submitUntilValidation(
  page: Page,
  button: import('@playwright/test').Locator,
  fields: Array<[import('@playwright/test').Locator, string]>
) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await button.click()
    try {
      await page.locator('form p.text-red-400').first().waitFor({
        state: 'visible',
        timeout: 800,
      })
      return
    } catch {
      // submit nativo o el error aún no pintó: reintentamos.
    }
    if (/\/login\?/.test(page.url()) || /\/registro\?/.test(page.url())) {
      // El submit nativo navegó y barrió los valores: recargar y re-sincronizar
      // con findSettledInput (maneja la hidratación que sigue al domcontentloaded).
      await page.goto(new URL(page.url()).pathname, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('form', { state: 'visible' })
      for (const [locator, value] of fields) {
        await findSettledInput(page, locator, value)
      }
    }
  }
  // Último intento con el matcher normal para tener un error legible
  await expect(page.locator('form p.text-red-400').first()).toBeVisible({ timeout: 5_000 })
}

/** Registra los pageerror de la página filtrando los artefactos conocidos.
 *  Devuelve { collect, errors, dispose } para usar con beforeEach/afterEach. */
export function createPageErrorCollector(page: Page) {
  const errors: string[] = []
  const handler = (e: Error) => {
    if (!SW_ARTIFACT.test(e.message)) errors.push(e.message)
  }
  page.on('pageerror', handler)
  return {
    getErrors: () => errors,
    dispose: () => page.off('pageerror', handler),
  }
}
