/** Utilidades de fecha en la zona horaria del servidor/app (Europe/Madrid). */

const MADRID_TZ = 'Europe/Madrid'
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(v: string | null | undefined): v is string {
  if (!v || !ISO_DATE_RE.test(v)) return false
  return !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
}

/** Fecha de hoy (Madrid) como ISO yyyy-mm-dd. */
export function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: MADRID_TZ })
}

/** Suma días a una fecha ISO. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Normaliza texto introducido a mano a ISO.
 * Acepta dd/mm/yyyy, dd-mm-yyyy, yyyymmdd y yyyy-mm-dd.
 * Devuelve null si es inválida o imposible.
 */
export function parseFlexibleDate(input: string, localeTag = 'es-ES'): string | null {
  const raw = input.trim()
  if (!raw) return null

  let iso: string | null = null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    iso = raw
  } else if (/^\d{8}$/.test(raw)) {
    iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  } else {
    // dd/mm/yyyy o dd-mm-yyyy (también con año corto dd/mm/yy)
    const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/)
    if (m) {
      const day = m[1].padStart(2, '0')
      const month = m[2].padStart(2, '0')
      const year =
        m[3].length === 2
          ? `20${m[3]}`
          : m[3]
      iso = `${year}-${month}-${day}`
    }
  }

  if (!iso || Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime())) return null

  // Validación real de calendario (p.ej. 31/02 → inválida)
  const check = new Date(`${iso}T12:00:00Z`)
  const roundTrip = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(check)
  if (roundTrip !== iso) return null

  // En locales en-US el orden sería mm/dd — desactivado: asumimos día/mes
  // europeo para todos los idiomas soportados (es/ca/gl/eu/en-GB/fr).
  void localeTag
  return iso
}
