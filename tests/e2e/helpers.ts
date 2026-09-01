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
