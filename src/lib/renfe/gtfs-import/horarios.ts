import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import type { StopTimeRow } from './types'

type CsvRecord = Record<string, string>

function todayYYYYMMDD(): string {
  return new Date().toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('')
}

function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Madrid', weekday: 'long' }).toLowerCase()
}

const FEEDS: { name: string; url: string; source: string }[] = [
  {
    name: 'Cercanías',
    url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
    source: 'cercanias',
  },
  {
    name: 'AV/LD/MD',
    url: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
    source: 'md',
  },
]

export async function importHorarios(): Promise<{ totalRows: number; failures: string[]; rows: StopTimeRow[]; serviceDate: string }> {
  const today = todayYYYYMMDD()
  const todayIso = todayISO()
  const dow = getDayOfWeek()
  const failures: string[] = []
  const allRows: StopTimeRow[] = []

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) {
        failures.push(`${feed.name}: HTTP ${res.status}`)
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const zip = new AdmZip(buffer)

      const calendarRaw = zip.readAsText('calendar.txt')
      if (!calendarRaw) {
        failures.push(`${feed.name}: calendar.txt not found`)
        continue
      }

      const calendar: CsvRecord[] = parse(calendarRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })
      const activeServiceIds = new Set<string>()

      for (const cal of calendar) {
        if (cal[dow] === '1' && cal.start_date <= today && today <= cal.end_date) {
          activeServiceIds.add(cal.service_id)
        }
      }

      if (activeServiceIds.size === 0) {
        failures.push(`${feed.name}: no active service for today (${dow})`)
        continue
      }

      const routesRaw = zip.readAsText('routes.txt')
      if (!routesRaw) {
        failures.push(`${feed.name}: routes.txt not found`)
        continue
      }

      const routes: CsvRecord[] = parse(routesRaw, { columns: true, skip_empty_lines: true })
      const routeShortNames = new Map<string, string>()
      for (const r of routes) {
        if (r.route_id && r.route_short_name) routeShortNames.set(r.route_id, r.route_short_name)
      }

      const tripsRaw = zip.readAsText('trips.txt')
      if (!tripsRaw) {
        failures.push(`${feed.name}: trips.txt not found`)
        continue
      }

      const trips: CsvRecord[] = parse(tripsRaw, { columns: true, skip_empty_lines: true })
      const activeTripRoutes = new Map<string, string>()

      for (const t of trips) {
        if (!activeServiceIds.has(t.service_id)) continue
        const shortName = routeShortNames.get(t.route_id) ?? t.route_id
        activeTripRoutes.set(t.trip_id, shortName)
      }

      if (activeTripRoutes.size === 0) {
        failures.push(`${feed.name}: no active trips for today`)
        continue
      }

      const stopTimesRaw = zip.readAsText('stop_times.txt')
      if (!stopTimesRaw) {
        failures.push(`${feed.name}: stop_times.txt not found`)
        continue
      }

      const stopTimes: CsvRecord[] = parse(stopTimesRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })

      for (const st of stopTimes) {
        const tripId = st.trip_id?.trim()
        const routeId = activeTripRoutes.get(tripId)
        if (!routeId) continue

        const departure = st.departure_time?.trim() || st.arrival_time?.trim()
        if (!departure) continue

        allRows.push({
          trip_id: tripId,
          route_id: routeId,
          stop_id: (st.stop_id ?? '').trim(),
          stop_sequence: parseInt(st.stop_sequence, 10) || 0,
          departure_time: departure,
          service_date: todayIso,
          feed_source: feed.source,
        })
      }
    } catch (err) {
      failures.push(`${feed.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  return { totalRows: allRows.length, failures, rows: allRows, serviceDate: todayIso }
}
