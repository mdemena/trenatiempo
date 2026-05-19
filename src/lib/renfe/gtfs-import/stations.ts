import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import type { StationRow } from './types'

type CsvRecord = Record<string, string>

const FEEDS: { name: string; url: string; defaultTypes: string[]; hasRouteClassification: boolean }[] = [
  {
    name: 'Cercanías',
    url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
    defaultTypes: ['cercanias'],
    hasRouteClassification: false,
  },
  {
    name: 'AV/LD/MD',
    url: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
    defaultTypes: ['md'],
    hasRouteClassification: true,
  },
]

function classifyRoute(routeId: string, routeShortName: string, routeLongName: string): string {
  const hay = `${routeId} ${routeShortName} ${routeLongName}`.toUpperCase()

  if (/\bAVE\b|\bALTA VELOCIDAD\b/.test(hay)) return 'ave'
  if (/\bALVIA\b|\bLD\b|\bLARGA DISTANCIA\b|\bEUROMED\b|\bTALGO\b|\bINTERCITY\b|\bEXPRESO\b/.test(hay))
    return 'ld'
  if (/\bREGIONAL\b|\bREG\b|\bAVANT\b/.test(hay)) return 'regional'

  return 'md'
}

export async function importStations(): Promise<{ count: number; failures: string[]; stations: StationRow[] }> {
  const stationMap = new Map<string, { id: string; name: string; lat: number; lng: number; types: Set<string> }>()
  const failures: string[] = []

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) {
        failures.push(`${feed.name}: HTTP ${res.status}`)
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const zip = new AdmZip(buffer)

      const stopsRaw = zip.readAsText('stops.txt')
      if (!stopsRaw) {
        failures.push(`${feed.name}: stops.txt not found in zip`)
        continue
      }

      const stops: CsvRecord[] = parse(stopsRaw, { columns: true, skip_empty_lines: true, relax_column_count: true, delimiter: ',' })

      for (const stop of stops) {
        const id = stop.stop_id?.trim()
        const name = stop.stop_name?.trim()
        const lat = parseFloat(stop.stop_lat)
        const lng = parseFloat(stop.stop_lon)

        if (!id || !name || isNaN(lat) || isNaN(lng)) continue

        if (!stationMap.has(id)) {
          stationMap.set(id, { id, name, lat, lng, types: new Set(feed.defaultTypes) })
        } else {
          for (const t of feed.defaultTypes) stationMap.get(id)!.types.add(t)
        }
      }

      if (!feed.hasRouteClassification) continue

      const routesRaw = zip.readAsText('routes.txt')
      const tripsRaw = zip.readAsText('trips.txt')
      const stopTimesRaw = zip.readAsText('stop_times.txt')
      if (!routesRaw || !tripsRaw || !stopTimesRaw) {
        failures.push(`${feed.name}: route files not found`)
        continue
      }

      const routes: CsvRecord[] = parse(routesRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })
      const routeType = new Map<string, string>()
      for (const r of routes) {
        routeType.set(r.route_id, classifyRoute(r.route_id, r.route_short_name ?? '', r.route_long_name ?? ''))
      }

      const trips: CsvRecord[] = parse(tripsRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })
      const tripType = new Map<string, string>()
      for (const t of trips) {
        const type = routeType.get(t.route_id)
        if (type) tripType.set(t.trip_id, type)
      }

      const stopTimes: CsvRecord[] = parse(stopTimesRaw, { columns: true, skip_empty_lines: true, relax_column_count: true })
      for (const st of stopTimes) {
        const serviceType = tripType.get(st.trip_id)
        if (!serviceType) continue
        const stopId = st.stop_id?.trim()
        if (!stopId || !stationMap.has(stopId)) continue

        const station = stationMap.get(stopId)!
        station.types.delete('md')
        station.types.add(serviceType)
      }
    } catch (err) {
      failures.push(`${feed.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  const stations: StationRow[] = []
  for (const s of stationMap.values()) {
    stations.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, types: [...s.types], active: true })
  }

  return { count: stations.length, failures, stations }
}
