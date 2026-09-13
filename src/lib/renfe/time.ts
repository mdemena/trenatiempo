// Utilidades de tiempo GTFS (zona Europe/Madrid). Compartidas entre rutas y
// el monitor de push. Los GTFS usan "HH:MM:SS" local con horas ≥ 24 para
// servicios que cruzan la medianoche.

const MADRID_TZ = 'Europe/Madrid'

/** "HH:MM:SS" → segundos desde medianoche (las horas pueden ser ≥ 24). */
export function gtfsTimeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)
}

/** Segundos desde medianoche → "HH:MM:SS" (puede superar 24h). */
export function secondsToGtfsTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

/** Fecha de hoy (Madrid) como ISO yyyy-mm-dd. */
export function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: MADRID_TZ })
}

/** Hora GTFS actual ("HH:MM:SS") en Madrid. */
export function nowGtfsTime(): string {
  const madrid = new Date(
    new Date().toLocaleString('sv-SE', { timeZone: MADRID_TZ })
  )
  return secondsToGtfsTime(
    madrid.getHours() * 3600 + madrid.getMinutes() * 60 + madrid.getSeconds()
  )
}

/**
 * Convierte una hora GTFS "HH:MM:SS" (modo local Madrid, hora ≥ 24 = día
 * siguiente) a un timestamp Unix (segundos).
 */
export function gtfsTimeToUnix(gtfsTime: string, dateIso: string): number {
  const parts = gtfsTime.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const s = parts[2] ?? 0

  // Horas ≥ 24 indican servicio del día siguiente
  const dayOffset = Math.floor(h / 24)
  const adjH = h % 24

  const base = new Date(dateIso + 'T00:00:00Z')
  base.setUTCDate(base.getUTCDate() + dayOffset)
  const adjustedISO = base.toISOString().slice(0, 10)

  // Offset UTC de Madrid comparando la hora local al mediodía UTC
  const noonUTC = new Date(adjustedISO + 'T12:00:00Z')
  const madridHourAtNoon = parseInt(
    new Intl.DateTimeFormat('en', {
      timeZone: MADRID_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(noonUTC),
    10
  )
  const offsetHours = madridHourAtNoon - 12 // +2 verano, +1 invierno

  const madridMidnightMs =
    new Date(adjustedISO + 'T00:00:00Z').getTime() - offsetHours * 3600 * 1000

  return Math.floor(madridMidnightMs / 1000) + adjH * 3600 + m * 60 + s
}

/** Timestamp Unix (segundos o cadena) → "HH:MM:SS" en Madrid. */
export function unixToMadridTime(raw: unknown): string {
  const sec = parseInt(String(raw ?? 0), 10)
  return new Date(sec * 1000).toLocaleTimeString('es-ES', {
    timeZone: MADRID_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}