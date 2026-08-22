import AdmZip from 'adm-zip'
import type {
  StopTimeRow,
  ServiceRow,
  ServiceExceptionRow,
  TripRow,
  HorarioImportResult,
  HorarioFeedDetail,
} from './types'

/**
 * Imports the full schedule period from both Renfe GTFS feeds:
 *   - calendar.txt      → gtfs_services
 *   - calendar_dates.txt → gtfs_service_exceptions (if present)
 *   - trips.txt         → gtfs_trips
 *   - stop_times.txt    → gtfs_stop_times (date-independent)
 *
 * Unlike the previous single-day import, this stores every service in the feed
 * coverage window (~1 month Cercanías, ~4 months AV/LD/MD) once. The RPC
 * `get_stop_departures` resolves which services run on any requested date.
 */

// Minimal CSV parser: Renfe GTFS files are simple comma-separated values with
// no quoted commas; headers may carry trailing padding whitespace.
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter((l) => l.trim() !== '')
  const headers = (lines[0] ?? '').split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((l) => l.split(','))
  return { headers, rows }
}

function toRows(csv: { headers: string[]; rows: string[][] }): Record<string, string>[] {
  return csv.rows.map((cols) => {
    const rec: Record<string, string> = {}
    for (let i = 0; i < csv.headers.length; i++) {
      rec[csv.headers[i]] = (cols[i] ?? '').trim()
    }
    return rec
  })
}

/** "20260822" → "2026-08-22". Returns null when malformed. */
function yyyymmddToIso(v: string): string | null {
  if (!/^\d{8}$/.test(v)) return null
  const y = v.slice(0, 4)
  const m = v.slice(4, 6)
  const d = v.slice(6, 8)
  const iso = `${y}-${m}-${d}`
  // Reject impossible dates (e.g. 20260231)
  if (Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime())) return null
  return iso
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
  const failures: string[] = []
  const allStopTimes: StopTimeRow[] = []
  const allServices: ServiceRow[] = []
  const allExceptions: ServiceExceptionRow[] = []
  const allTrips: TripRow[] = []
  const feeds: HorarioFeedDetail[] = []

  for (const feed of FEEDS) {
    const detail: HorarioFeedDetail = {
      name: feed.name,
      source: feed.source,
      servicesCount: 0,
      exceptionsCount: 0,
      tripsCount: 0,
      routesLoaded: 0,
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

      // ── calendar.txt → services ────────────────────────────────────────
      const calendarRaw = zip.readAsText('calendar.txt')
      if (!calendarRaw) {
        detail.error = 'calendar.txt not found'
        failures.push(`${feed.name}: calendar.txt not found`)
        feeds.push(detail)
        continue
      }

      const serviceIds = new Set<string>()
      for (const cal of toRows(parseCsv(calendarRaw))) {
        const start = yyyymmddToIso(cal['start_date'] ?? '')
        const end = yyyymmddToIso(cal['end_date'] ?? '')
        const serviceId = cal['service_id']
        if (!serviceId || !start || !end) continue

        serviceIds.add(serviceId)
        detail.servicesCount++
        if (
          detail.coverageStart === undefined ||
          start < detail.coverageStart
        ) {
          detail.coverageStart = start
        }
        if (detail.coverageEnd === undefined || end > detail.coverageEnd) {
          detail.coverageEnd = end
        }

        allServices.push({
          service_id: serviceId,
          feed_source: feed.source,
          start_date: start,
          end_date: end,
          monday: cal['monday'] === '1',
          tuesday: cal['tuesday'] === '1',
          wednesday: cal['wednesday'] === '1',
          thursday: cal['thursday'] === '1',
          friday: cal['friday'] === '1',
          saturday: cal['saturday'] === '1',
          sunday: cal['sunday'] === '1',
        })
      }

      if (detail.servicesCount === 0) {
        detail.error = 'no services parsed from calendar.txt'
        failures.push(`${feed.name}: no services parsed from calendar.txt`)
        feeds.push(detail)
        continue
      }

      // ── calendar_dates.txt → exceptions (optional file) ────────────────
      const calDatesRaw = zip.readAsText('calendar_dates.txt')
      if (calDatesRaw) {
        for (const exc of toRows(parseCsv(calDatesRaw))) {
          const serviceId = exc['service_id']
          const date = yyyymmddToIso(exc['date'] ?? '')
          const type = parseInt(exc['exception_type'] ?? '', 10)
          // FK safety: skip exceptions referencing unknown services
          if (!serviceId || !date || (type !== 1 && type !== 2)) continue
          if (!serviceIds.has(serviceId)) continue

          detail.exceptionsCount++
          allExceptions.push({
            service_id: serviceId,
            feed_source: feed.source,
            exception_date: date,
            exception_type: type,
          })
        }
      }

      // ── routes.txt → short names ───────────────────────────────────────
      const routesRaw = zip.readAsText('routes.txt')
      if (!routesRaw) {
        detail.error = 'routes.txt not found'
        failures.push(`${feed.name}: routes.txt not found`)
        feeds.push(detail)
        continue
      }

      const routeShortNames = new Map<string, string>()
      for (const r of toRows(parseCsv(routesRaw))) {
        if (r['route_id'] && r['route_short_name']) {
          routeShortNames.set(r['route_id'], r['route_short_name'])
        }
      }
      detail.routesLoaded = routeShortNames.size

      // ── trips.txt → trip/service mapping ───────────────────────────────
      const tripsRaw = zip.readAsText('trips.txt')
      if (!tripsRaw) {
        detail.error = 'trips.txt not found'
        failures.push(`${feed.name}: trips.txt not found`)
        feeds.push(detail)
        continue
      }

      const tripIds = new Set<string>()
      for (const t of toRows(parseCsv(tripsRaw))) {
        const tripId = t['trip_id']
        const serviceId = t['service_id']
        if (!tripId || !serviceId || !serviceIds.has(serviceId)) continue

        tripIds.add(tripId)
        detail.tripsCount++
        allTrips.push({
          trip_id: tripId,
          service_id: serviceId,
          route_id: routeShortNames.get(t['route_id']) ?? t['route_id'] ?? '',
          feed_source: feed.source,
        })
      }

      if (detail.tripsCount === 0) {
        detail.error = 'no trips parsed'
        failures.push(`${feed.name}: no trips parsed`)
        feeds.push(detail)
        continue
      }

      // ── stop_times.txt ─────────────────────────────────────────────────
      const stopTimesRaw = zip.readAsText('stop_times.txt')
      if (!stopTimesRaw) {
        detail.error = 'stop_times.txt not found'
        failures.push(`${feed.name}: stop_times.txt not found`)
        feeds.push(detail)
        continue
      }

      const stopTimesCsv = parseCsv(stopTimesRaw)
      const idxTrip = stopTimesCsv.headers.indexOf('trip_id')
      const idxStop = stopTimesCsv.headers.indexOf('stop_id')
      const idxSeq = stopTimesCsv.headers.indexOf('stop_sequence')
      const idxDep = stopTimesCsv.headers.indexOf('departure_time')
      const idxArr = stopTimesCsv.headers.indexOf('arrival_time')

      for (const cols of stopTimesCsv.rows) {
        const tripId = (cols[idxTrip] ?? '').trim()
        const departure = (cols[idxDep] ?? cols[idxArr] ?? '').trim()
        if (!tripId || !departure) continue
        if (!tripIds.has(tripId)) continue

        detail.rowsParsed++
        allStopTimes.push({
          trip_id: tripId,
          route_id: '', // filled below from trips map
          stop_id: (cols[idxStop] ?? '').trim(),
          stop_sequence: parseInt(cols[idxSeq] ?? '', 10) || 0,
          departure_time: departure,
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

  // Fill route_id on stop times from the trip mapping (single pass).
  const routeByTrip = new Map(allTrips.map((t) => [t.trip_id, t.route_id]))
  for (const st of allStopTimes) {
    st.route_id = routeByTrip.get(st.trip_id) ?? ''
  }

  return {
    totalStopTimes: allStopTimes.length,
    servicesCount: allServices.length,
    exceptionsCount: allExceptions.length,
    tripsCount: allTrips.length,
    failures,
    stopTimeRows: allStopTimes,
    serviceRows: allServices,
    exceptionRows: allExceptions,
    tripRows: allTrips,
    feeds,
  }
}
