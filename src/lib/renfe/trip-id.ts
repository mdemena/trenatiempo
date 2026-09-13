// Identidad de un tren a partir de su trip_id GTFS.
//
// Renfe codifica el mismo tren físico con trip_ids distintos según el día de
// servicio (ej. el R11 15726 es "5154D15726R11" un día y "5155L15726R11" otro),
// o con la fecha incrustada en MD/AV ("0019212026-09-01"). Para las alertas
// push la identidad durable es el número de tren + línea, independiente del día.

/** Extrae la línea/código de servicio desde el final del trip_id:
 *  "5154D15726R11" → "R11", "6265J71110C2" → "C2", "1053S27511C4b" → "C4b",
 *  "4770M00024BUS" → "BUS", "5173V28277R2S" → "R2S", "C1-23537" → "C1",
 *  "0019212026-09-01" → null (MD/AV sin línea en el id). */
export function extractRouteId(tripId: string): string | null {
  const s = (tripId ?? '').trim()
  if (!s) return null

  // Fecha incrustada (MD/AV): no hay línea en el trip_id.
  if (/20\d{2}-\d{2}-\d{2}$/.test(s)) return null

  // 1) Línea al final: se inicia justo después del run de dígitos del número
  //    de tren (≥ 3 dígitos) seguido de una letra.
  const runs = [...s.matchAll(/(\d{3,})/g)]
  for (let i = runs.length - 1; i >= 0; i--) {
    const after = s.slice((runs[i].index ?? 0) + runs[i][0].length)
    if (after && /^[A-Za-z]/.test(after)) {
      return after.match(/^[A-Za-z][A-Za-z0-9]*/)?.[0] ?? null
    }
  }

  // 2) Cercanías con guion "C1-23537": la "línea" es el prefijo alfa antes
  //    de los dígitos finales.
  const trailingDigits = s.match(/(\d+)$/)
  if (!trailingDigits?.index) return null
  const prefix = s.slice(0, trailingDigits.index).replace(/[^A-Za-z0-9]+$/, '')
  return prefix.match(/([A-Za-z][A-Za-z0-9]*)$/)?.[1] ?? null
}

/** Extrae el número de tren (identidad estable entre días). Funciona mejor con
 *  la línea conocida, pero la deriva de `extractRouteId` si no se aporta. */
export function extractTrainNumber(
  tripId: string,
  routeId?: string | null
): string | null {
  const s = (tripId ?? '').trim()
  if (!s) return null

  // 1) Si conocemos la línea y aparece en el trip_id, el número es el último
  //    run de dígitos inmediatamente anterior: "5154D15726R11" + "R11" → 15726,
  //    "1053S27511C4b" + "C4b" → 27511.
  const line = (routeId ?? '').trim() || extractRouteId(s)
  if (line) {
    const idx = s.indexOf(line)
    if (idx > 0) {
      const prefix = s.slice(0, idx)
      const runs = [...prefix.matchAll(/(\d+)/g)]
      const last = runs[runs.length - 1]
      if (last?.[1]) return last[1]
    }
  }

  // 2) MD/AV con fecha incrustada: "0019212026-09-01" → "001921".
  const dateForm = s.match(/^(\d+?)(?:20\d{2}-\d{2}-\d{2})$/)
  if (dateForm?.[1]) return dateForm[1]

  // 3) Sin separador reconocible: último bloque de dígitos.
  return s.match(/(\d+)$/)?.[1] ?? null
}