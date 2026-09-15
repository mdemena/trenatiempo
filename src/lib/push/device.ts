/**
 * Información del dispositivo/navegador que registra la suscripción push.
 *
 * Fuente preferida: `navigator.userAgentData` (Client Hints) en Chromium 90+,
 * que da el modelo real del dispositivo (p.ej. "Pixel 8", "iPhone 15 Pro") de
 * forma privada y estructurada. Fallback: parseo del User-Agent (Safari /
 * Firefox y navegadores sin Client Hints). Se envían al servidor como campos
 * separados (device_browser / device_os / device_model) y se muestran en la
 * lista de alertas para que el usuario sepa DÓNDE llegará la notificación.
 */

export interface DeviceInfo {
  browser?: string
  os?: string
  model?: string
  mobile: boolean
}

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/edg\//, 'Edge'],
  [/samsungbrowser\//, 'Samsung Internet'],
  [/crios\//, 'Chrome'],
  [/fxios\//, 'Firefox'],
  [/chrome\//, 'Chrome'],
  [/firefox\//, 'Firefox'],
  [/opera|opr\//, 'Opera'],
  [/safari\//, 'Safari'],
]

const OS_PATTERNS: Array<[RegExp, string]> = [
  [/windows phone/, 'Windows Phone'],
  [/android/, 'Android'],
  [/iphone|ipad|ipod/, 'iOS'],
  [/windows nt/, 'Windows'],
  [/mac os x/, 'macOS'],
  [/linux/, 'Linux'],
]

export function parseUserAgent(userAgent: string | null | undefined): DeviceInfo | null {
  if (!userAgent) return null

  const ua = userAgent.toLowerCase()
  const browser = BROWSER_PATTERNS.find(([re]) => re.test(ua))?.[1]
  const os = OS_PATTERNS.find(([re]) => re.test(ua))?.[1]
  if (!browser && !os) return null
  const mobile = /(android|iphone|ipad|ipod|windows phone|mobile)/.test(ua)

  return { browser, os, mobile }
}

// Nombres de marca legibles: "Google Chrome" → "Chrome"
const BRAND_SHORT: Record<string, string> = {
  'Google Chrome': 'Chrome',
  'Microsoft Edge': 'Edge',
  SamsungInternet: 'Samsung Internet',
  Opera: 'Opera',
  'Opera GX': 'Opera',
  Firefox: 'Firefox',
  Safari: 'Safari',
  Brave: 'Brave',
  Chromium: 'Chromium',
}

interface UADataBrand {
  brand: string
  version: string
}

/** Elige la marca "real" de la lista de Client Hints (descarta "Not A Brand"
 *  y prefiere la marca de usuario sobre "Chromium"). */
function brandFrom(brands: UADataBrand[] | undefined): string | undefined {
  if (!brands?.length) return undefined
  const real = brands.filter((b) => !/not.*brand/i.test(b.brand))
  const userFacing = real.filter((b) => b.brand !== 'Chromium')
  const names = Object.keys(BRAND_SHORT).filter((k) => k !== 'Chromium')
  const brand =
    userFacing.find((b) => names.includes(b.brand))?.brand ??
    userFacing[0]?.brand ??
    real.find((b) => b.brand === 'Chromium')?.brand ??
    'Chromium'
  return BRAND_SHORT[brand] ?? brand
}

interface UADataLike {
  platform?: string
  mobile?: boolean
  brands?: UADataBrand[]
  getHighEntropyValues?(
    hints: string[]
  ): Promise<{
    platform?: string
    model?: string
    fullVersionList?: UADataBrand[]
  }>
}

/**
 * Mejor información disponible de este navegador/dispositivo. Debe llamarse en
 * el cliente (necesita `navigator`). Devuelve null si no hay nada reconocible.
 */
export async function getDeviceInfo(): Promise<DeviceInfo | null> {
  if (typeof navigator === 'undefined') return null

  const uaData = (navigator as unknown as { userAgentData?: UADataLike }).userAgentData

  if (uaData) {
    // Chromium 90+: Client Hints (permite obtener el modelo del dispositivo)
    if (typeof uaData.getHighEntropyValues === 'function') {
      try {
        const entropy = await uaData.getHighEntropyValues([
          'platform',
          'model',
          'fullVersionList',
        ])
        const browser = brandFrom(entropy.fullVersionList ?? uaData.brands)
        return {
          browser: browser ?? 'Chromium',
          os: entropy.platform ?? uaData.platform ?? undefined,
          model: entropy.model || undefined,
          mobile: uaData.mobile ?? false,
        }
      } catch {
        // getHighEntropyValues puede rechazar (permiso denegado/introspección
        // activa) → caemos a los valores de bajo nivel
      }
    }
    const browser = brandFrom(uaData.brands)
    return {
      browser: browser ?? 'Chromium',
      os: uaData.platform ?? undefined,
      mobile: uaData.mobile ?? false,
    }
  }

  // Safari / Firefox: parseamos el User-Agent
  return parseUserAgent(navigator.userAgent)
}

/** Etiqueta legible a partir de los campos guardados en la suscripción. */
export function deviceLabel(device: {
  browser?: string | null
  os?: string | null
  model?: string | null
}): string | null {
  const parts = [device.model, device.browser, device.os]
    .map((p) => (p ? p.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}