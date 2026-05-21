import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import type { StopTimeRow, HorarioImportResult, HorarioFeedDetail } from './types'

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

export async function importHorarios(): Promise<HorarioImportResult> {
  const today = todayYYYYMMDD()
  const todayIso = todayISO()
  const dow = getDayOfWeek()
  const failures: string[] = []
  const allRows: StopTimeRow[] = []
  const feeds: HorarioFeedDetail[] = []

  for (const feed of FEEDS) {
    const detail: HorarioFeedDetail = {
      name: feed.name,
      source: feed.source,
      activeServiceIds: [],
      routesLoaded: 0,
      activeTrips: 0,
      rowsParsed: 0,
      rowsInserted: 0,
      rowsFailed: 0,
    }

    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) {
        detail.error = `HTTP ${res.status}`
        failures.push(`${feed.name}: HTTP ${res.status}`)
        feeds.push(detail)
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const zip = new AdmZip(buffer)

      const calendarRaw = zip.readAsText('calendar.txt')
      if (!calendarRaw) {
        detail.error = 'calendar.txt not found'
        failures.push(`${feed.name}: calendar.txt not found`)
        feeds.push(detail)
        continue
      }

      const calendar: CsvRecord[] = parse(calendarRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })
      const activeServiceIds = new Set<string>()

      for (const cal of calendar) {
        if (cal[dow] === '1' && cal.start_date <= today && today <= cal.end_date) {
          activeServiceIds.add(cal.service_id)
        }
      }

      detail.activeServiceIds = [...activeServiceIds]

      if (activeServiceIds.size === 0) {
        detail.error = `no active service for today (${dow})`
        failures.push(`${feed.name}: no active service for today (${dow})`)
        feeds.push(detail)
        continue
      }

      const routesRaw = zip.readAsText('routes.txt')
      if (!routesRaw) {
        detail.error = 'routes.txt not found'
        failures.push(`${feed.name}: routes.txt not found`)
        feeds.push(detail)
        continue
      }

      const routes: CsvRecord[] = parse(routesRaw, { columns: true, skip_empty_lines: true })
      const routeShortNames = new Map<string, string>()
      for (const r of routes) {
        if (r.route_id && r.route_short_name) routeShortNames.set(r.route_id, r.route_short_name)
      }
      detail.routesLoaded = routeShortNames.size

      const tripsRaw = zip.readAsText('trips.txt')
      if (!tripsRaw) {
        detail.error = 'trips.txt not found'
        failures.push(`${feed.name}: trips.txt not found`)
        feeds.push(detail)
        continue
      }

      const trips: CsvRecord[] = parse(tripsRaw, { columns: true, skip_empty_lines: true })
      const activeTripRoutes = new Map<string, string>()

      for (const t of trips) {
        if (!activeServiceIds.has(t.service_id)) continue
        const shortName = routeShortNames.get(t.route_id) ?? t.route_id
        activeTripRoutes.set(t.trip_id, shortName)
      }

      detail.activeTrips = activeTripRoutes.size

      if (activeTripRoutes.size === 0) {
        detail.error = 'no active trips for today'
        failures.push(`${feed.name}: no active trips for today`)
        feeds.push(detail)
        continue
      }

      const stopTimesRaw = zip.readAsText('stop_times.txt')
      if (!stopTimesRaw) {
        detail.error = 'stop_times.txt not found'
        failures.push(`${feed.name}: stop_times.txt not found`)
        feeds.push(detail)
        continue
      }

      const stopTimes: CsvRecord[] = parse(stopTimesRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })

      for (const st of stopTimes) {
        const tripId = st.trip_id?.trim()
        const routeId = activeTripRoutes.get(tripId)
        if (!routeId) continue

        const departure = st.departure_time?.trim() || st.arrival_time?.trim()
        if (!departure) continue

        detail.rowsParsed++

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
      const msg = err instanceof Error ? err.message : 'unknown error'
      detail.error = msg
      failures.push(`${feed.name}: ${msg}`)
    }

    feeds.push(detail)
  }

  return { totalRows: allRows.length, failures, rows: allRows, serviceDate: todayIso, feeds }
}
