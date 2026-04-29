#!/usr/bin/env node
/**
 * Seed the `stations` table from Renfe GTFS feeds:
 *   - Cercanías  → https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip
 *   - AV/LD/MD   → https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip
 *
 * Stations that appear in both feeds get merged types, e.g. ['cercanias', 'md'].
 * Service classification uses routes.txt from the AV/LD/MD feed:
 *   AVE / Alta Velocidad              → 'ave'
 *   LD / Larga Distancia / ALVIA ...  → 'ld'
 *   Regional / AVANT / EUROMED        → 'regional'
 *   Everything else (MD)              → 'md'
 *
 * Usage:
 *   node scripts/seed-stations.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * System deps: curl, unzip
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

// ─── Load .env.local ──────────────────────────────────────────────────────────

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const envPath = join(ROOT, '.env.local')

if (!existsSync(envPath)) {
  console.error('❌  .env.local not found. Copy env.example and fill in your values.')
  process.exit(1)
}

const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
  env[key] = val
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── GTFS feeds ───────────────────────────────────────────────────────────────

const FEEDS = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSVRow(row) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of row) {
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseCSV(content) {
  const lines = content.replace(/\r/g, '').split('\n')
  const rawHeaders = parseCSVRow(lines[0].replace(/^﻿/, ''))
  const headers = rawHeaders.map((h) => h.replace(/"/g, '').trim())
  const col = (name) => headers.indexOf(name)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCSVRow(line)
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? '').replace(/"/g, '').trim()
    })
    rows.push(obj)
  }
  return { col, rows }
}

/**
 * Classify an AV/LD/MD route into one of our service types based on its name/id.
 * Returns one of: 'ave' | 'ld' | 'regional' | 'md'
 */
function classifyRoute(routeId, routeShortName, routeLongName) {
  const hay = `${routeId} ${routeShortName} ${routeLongName}`.toUpperCase()

  // Alta Velocidad
  if (/\bAVE\b|\bALTA VELOCIDAD\b/.test(hay)) return 'ave'

  // Larga Distancia
  if (/\bALVIA\b|\bLD\b|\bLARGA DISTANCIA\b|\bEUROMED\b|\bTALGO\b|\bINTERCITY\b|\bEXPRESO\b/.test(hay))
    return 'ld'

  // Regional / AVANT
  if (/\bREGIONAL\b|\bREG\b|\bAVANT\b/.test(hay)) return 'regional'

  // Default → Media Distancia
  return 'md'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/** Map<stop_id, { id, name, lat, lng, types: Set<string> }> */
const stationMap = new Map()

const TMP = join(tmpdir(), 'trenatiempo-gtfs')
const COOKIES = join(TMP, 'cookies.txt')
mkdirSync(TMP, { recursive: true })

for (const feed of FEEDS) {
  console.log(`\n📥  Downloading ${feed.name} GTFS...`)
  const safeName = feed.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const zipPath = join(TMP, `${safeName}.zip`)
  const extractDir = join(TMP, safeName)

  try {
    execSync(`curl -sL --max-time 120 -c "${COOKIES}" -b "${COOKIES}" -o "${zipPath}" "${feed.url}"`)
  } catch {
    console.error(`❌  curl failed for ${feed.name}. Skipping.`)
    continue
  }

  mkdirSync(extractDir, { recursive: true })

  // Extract stops.txt and, for AV/LD/MD, also routes + trips + stop_times
  const filesToExtract = feed.hasRouteClassification
    ? ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']
    : ['stops.txt']

  try {
    // Write the Python extractor to a temp file to avoid shell quoting issues entirely.
    const pyScript = join(TMP, 'extract.py')
    writeFileSync(
      pyScript,
      `import zipfile, os
zip_path = ${JSON.stringify(zipPath)}
dest = ${JSON.stringify(extractDir)}
files = ${JSON.stringify(filesToExtract)}
with zipfile.ZipFile(zip_path) as z:
    names = z.namelist()
    for f in files:
        if f in names:
            z.extract(f, dest)
`
    )
    execSync(`python3 "${pyScript}"`, { stdio: 'pipe' })
  } catch (err) {
    console.error(`❌  Extraction failed for ${feed.name}:`, err.stderr?.toString().trim())
    continue
  }

  // ── Parse stops.txt ──────────────────────────────────────────────────────

  console.log(`🔍  Parsing ${feed.name} stops...`)
  const { rows: stops } = parseCSV(readFileSync(join(extractDir, 'stops.txt'), 'utf8'))

  let stopCount = 0
  for (const stop of stops) {
    const id = stop['stop_id']
    const name = stop['stop_name']
    const lat = parseFloat(stop['stop_lat'])
    const lng = parseFloat(stop['stop_lon'])

    if (!id || !name || isNaN(lat) || isNaN(lng)) continue
    stopCount++

    if (!stationMap.has(id)) {
      stationMap.set(id, { id, name, lat, lng, types: new Set(feed.defaultTypes) })
    } else {
      for (const t of feed.defaultTypes) stationMap.get(id).types.add(t)
    }
  }
  console.log(`   ↳ ${stopCount} stops found`)

  // ── Refine types using routes for AV/LD/MD ───────────────────────────────

  if (!feed.hasRouteClassification) continue

  const routesPath = join(extractDir, 'routes.txt')
  const tripsPath = join(extractDir, 'trips.txt')
  const stopTimesPath = join(extractDir, 'stop_times.txt')

  if (!existsSync(routesPath) || !existsSync(tripsPath) || !existsSync(stopTimesPath)) {
    console.log('   ↳ Route files not found, keeping default types')
    continue
  }

  console.log('🗺   Classifying AV/LD/MD service types...')

  // route_id → service type
  const { rows: routes } = parseCSV(readFileSync(routesPath, 'utf8'))
  const routeType = new Map()
  for (const r of routes) {
    routeType.set(r['route_id'], classifyRoute(r['route_id'], r['route_short_name'], r['route_long_name']))
  }

  // trip_id → route_id → service type
  const { rows: trips } = parseCSV(readFileSync(tripsPath, 'utf8'))
  const tripType = new Map()
  for (const t of trips) {
    const type = routeType.get(t['route_id'])
    if (type) tripType.set(t['trip_id'], type)
  }

  // stop_id → Set of service types (stream stop_times.txt line by line — can be large)
  console.log('   ↳ Reading stop_times.txt (may take a moment)...')
  const stopTimesContent = readFileSync(stopTimesPath, 'utf8')
  const stopTimesLines = stopTimesContent.split('\n')
  const stHeaders = parseCSVRow(stopTimesLines[0].replace(/^﻿/, '')).map((h) =>
    h.replace(/"/g, '').trim()
  )
  const colTripId = stHeaders.indexOf('trip_id')
  const colStopId = stHeaders.indexOf('stop_id')

  if (colTripId === -1 || colStopId === -1) {
    console.log('   ↳ Unexpected stop_times.txt format, keeping default types')
    continue
  }

  for (let i = 1; i < stopTimesLines.length; i++) {
    const line = stopTimesLines[i].trim()
    if (!line) continue
    const cols = parseCSVRow(line)
    const tripId = cols[colTripId]?.replace(/"/g, '').trim()
    const stopId = cols[colStopId]?.replace(/"/g, '').trim()
    if (!tripId || !stopId) continue

    const serviceType = tripType.get(tripId)
    if (!serviceType) continue

    if (stationMap.has(stopId)) {
      // Remove the generic 'md' default and replace with specific type
      const station = stationMap.get(stopId)
      station.types.delete('md')
      station.types.add(serviceType)
    }
  }

  // Summary
  const typeCounts = {}
  for (const s of stationMap.values()) {
    for (const t of s.types) typeCounts[t] = (typeCounts[t] ?? 0) + 1
  }
  console.log('   ↳ Types:', Object.entries(typeCounts).map(([k, v]) => `${k}: ${v}`).join(', '))
}

// ─── Prepare final station list ───────────────────────────────────────────────

const stations = []
for (const s of stationMap.values()) {
  stations.push({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    types: [...s.types],
    active: true,
  })
}

console.log(`\n✅  Total unique stations: ${stations.length}`)

// ─── Upsert into Supabase ─────────────────────────────────────────────────────

const BATCH = 100
let inserted = 0
let failed = 0

console.log('📤  Inserting into Supabase...')

for (let i = 0; i < stations.length; i += BATCH) {
  const batch = stations.slice(i, i + BATCH)
  const { error } = await supabase
    .from('stations')
    .upsert(batch, { onConflict: 'id' })

  if (error) {
    console.error(`\n   Batch ${i}–${i + BATCH} error:`, error.message)
    failed += batch.length
  } else {
    inserted += batch.length
    process.stdout.write(`\r   ${inserted}/${stations.length} stations...`)
  }
}

console.log(`\n\n🎉  Done! Inserted: ${inserted}  |  Failed: ${failed}`)

if (failed > 0) {
  console.warn('⚠️   Some batches failed. Check SUPABASE_SERVICE_ROLE_KEY and table RLS policies.')
}
