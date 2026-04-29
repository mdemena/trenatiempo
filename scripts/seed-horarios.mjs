#!/usr/bin/env node
/**
 * Seed today's departure schedule into `gtfs_stop_times` from the Renfe Cercanías GTFS.
 *
 * Steps:
 *   1. Download + extract the Cercanías GTFS zip (reuses cached zip if < 6h old).
 *   2. Parse calendar.txt → active service_id for today.
 *   3. Parse trips.txt → active trip_ids + route_ids.
 *   4. Stream stop_times.txt filtering for active trip_ids (280 MB, handled line-by-line).
 *   5. Delete yesterday's rows, then upsert today's rows into `gtfs_stop_times`.
 *
 * Usage:
 *   node scripts/seed-horarios.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * System deps: curl
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import {
  readFileSync,
  writeFileSync,
  createReadStream,
  mkdirSync,
  existsSync,
  statSync,
} from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

// ─── Load .env.local ──────────────────────────────────────────────────────────

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const envPath = join(ROOT, '.env.local')

if (!existsSync(envPath)) {
  console.error('❌  .env.local not found.')
  process.exit(1)
}

const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CERCANIAS_URL = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip'
const TMP = join(tmpdir(), 'trenatiempo-gtfs')
const COOKIES = join(TMP, 'cookies.txt')
const ZIP = join(TMP, 'Cercan_as.zip')
const EXTRACT_DIR = join(TMP, 'Cercan_as')
const BATCH_SIZE = 500

mkdirSync(TMP, { recursive: true })
mkdirSync(EXTRACT_DIR, { recursive: true })

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayYYYYMMDD() {
  return new Date().toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('')  // DD/MM/YYYY → YYYYMMDD
}

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) // YYYY-MM-DD
}

function getDayOfWeek() {
  const dow = new Date().toLocaleDateString('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
  }).toLowerCase()  // 'monday', 'tuesday', ...
  return dow
}

// ─── Download GTFS zip (skip if cached < 6 h) ────────────────────────────────

const SIX_HOURS = 6 * 60 * 60 * 1000
const zipExists = existsSync(ZIP)
const zipAge = zipExists ? Date.now() - statSync(ZIP).mtimeMs : Infinity

if (zipAge < SIX_HOURS) {
  console.log(`📦  Using cached GTFS zip (${Math.round(zipAge / 60000)} min old)`)
} else {
  console.log('📥  Downloading Cercanías GTFS...')
  execSync(`curl -sL --max-time 120 -c "${COOKIES}" -b "${COOKIES}" -o "${ZIP}" "${CERCANIAS_URL}"`)
  console.log('   ↳ Done')
}

// ─── Extract needed files ─────────────────────────────────────────────────────

console.log('📦  Extracting GTFS files...')
const pyExtract = join(TMP, 'extract_horarios.py')
const filesToExtract = ['calendar.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']

writeFileSync(
  pyExtract,
  `import zipfile, os
zip_path = ${JSON.stringify(ZIP)}
dest = ${JSON.stringify(EXTRACT_DIR)}
files = ${JSON.stringify(filesToExtract)}
with zipfile.ZipFile(zip_path) as z:
    names = z.namelist()
    for f in files:
        if f in names:
            z.extract(f, dest)
`
)
execSync(`python3 "${pyExtract}"`, { stdio: 'pipe' })

// ─── Parse calendar.txt → active service_id for today ────────────────────────

const today = todayYYYYMMDD()
const todayIso = todayISO()
const dow = getDayOfWeek()

console.log(`📅  Today: ${todayIso} (${dow})`)

const calendarLines = readFileSync(join(EXTRACT_DIR, 'calendar.txt'), 'utf8').trim().split('\n')
const calHeaders = calendarLines[0].split(',').map((h) => h.trim().replace(/"/g, ''))

const activeServiceIds = new Set()
for (let i = 1; i < calendarLines.length; i++) {
  const cols = calendarLines[i].split(',').map((c) => c.trim().replace(/"/g, ''))
  const row = Object.fromEntries(calHeaders.map((h, idx) => [h, cols[idx] ?? '']))

  const start = row['start_date']
  const end = row['end_date']
  const runsToday = row[dow] === '1'

  if (runsToday && start <= today && today <= end) {
    activeServiceIds.add(row['service_id'])
  }
}

console.log(`   ↳ Active service_ids: ${activeServiceIds.size} — ${[...activeServiceIds].join(', ')}`)

if (activeServiceIds.size === 0) {
  console.error('❌  No active service_ids found for today. Check calendar.txt format.')
  process.exit(1)
}

// ─── Parse routes.txt → Map<route_id, route_short_name> ─────────────────────

const routeLines = readFileSync(join(EXTRACT_DIR, 'routes.txt'), 'utf8').trim().split('\n')
const routeHeaders = routeLines[0].split(',').map((h) => h.trim().replace(/"/g, ''))
const colRId = routeHeaders.indexOf('route_id')
const colShortName = routeHeaders.indexOf('route_short_name')

/** Map<gtfs_route_id, route_short_name> e.g. "51T0027R2" → "R2" */
const routeShortNames = new Map()
for (let i = 1; i < routeLines.length; i++) {
  const cols = routeLines[i].split(',').map((c) => c.trim().replace(/"/g, ''))
  const rId = cols[colRId]
  const short = cols[colShortName]
  if (rId && short) routeShortNames.set(rId, short)
}
console.log(`   ↳ ${routeShortNames.size} routes loaded`)

// ─── Parse trips.txt → Map<trip_id, route_short_name> for active trips ───────

console.log('🗂   Building active trip index...')

const tripLines = readFileSync(join(EXTRACT_DIR, 'trips.txt'), 'utf8').trim().split('\n')
const tripHeaders = tripLines[0].split(',').map((h) => h.trim().replace(/"/g, ''))

const colTripId = tripHeaders.indexOf('trip_id')
const colRouteId = tripHeaders.indexOf('route_id')
const colServiceId = tripHeaders.indexOf('service_id')

/** Map<trip_id, route_short_name> e.g. "3016X23731C5" → "R2" */
const activeTripRoutes = new Map()

for (let i = 1; i < tripLines.length; i++) {
  const cols = tripLines[i].split(',').map((c) => c.trim().replace(/"/g, ''))
  const serviceId = cols[colServiceId]
  if (!activeServiceIds.has(serviceId)) continue
  const gtfsRouteId = cols[colRouteId] ?? ''
  const shortName = routeShortNames.get(gtfsRouteId) ?? gtfsRouteId
  activeTripRoutes.set(cols[colTripId], shortName)
}

console.log(`   ↳ Active trips: ${activeTripRoutes.size}`)

if (activeTripRoutes.size === 0) {
  console.error('❌  No active trips found.')
  process.exit(1)
}

// ─── Stream stop_times.txt, filter active trips ───────────────────────────────

console.log('🚂  Streaming stop_times.txt (may take ~30s for 280 MB)...')

const stopTimesPath = join(EXTRACT_DIR, 'stop_times.txt')
const rl = createInterface({ input: createReadStream(stopTimesPath), crlfDelay: Infinity })

let stHeaders = null
let colST = {}
let rowBuffer = []
let totalRows = 0
let insertedRows = 0
let failedRows = 0

async function flushBatch(rows) {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('gtfs_stop_times')
    .upsert(rows, { onConflict: 'trip_id,stop_id,service_date' })
  if (error) {
    failedRows += rows.length
  } else {
    insertedRows += rows.length
  }
  process.stdout.write(`\r   ${insertedRows} rows inserted...`)
}

for await (const line of rl) {
  if (!stHeaders) {
    stHeaders = line.replace(/\r/g, '').split(',').map((h) => h.trim().replace(/"/g, ''))
    colST = {
      tripId: stHeaders.indexOf('trip_id'),
      stopId: stHeaders.indexOf('stop_id'),
      stopSeq: stHeaders.indexOf('stop_sequence'),
      departure: stHeaders.indexOf('departure_time'),
      arrival: stHeaders.indexOf('arrival_time'),
    }
    continue
  }

  const cols = line.replace(/\r/g, '').split(',').map((c) => c.trim().replace(/"/g, ''))
  const tripId = cols[colST.tripId]
  if (!activeTripRoutes.has(tripId)) continue

  const departure = cols[colST.departure] || cols[colST.arrival]
  if (!departure) continue

  totalRows++
  rowBuffer.push({
    trip_id: tripId,
    route_id: activeTripRoutes.get(tripId),
    stop_id: cols[colST.stopId],
    stop_sequence: parseInt(cols[colST.stopSeq], 10) || 0,
    departure_time: departure,
    service_date: todayIso,
  })

  if (rowBuffer.length >= BATCH_SIZE) {
    await flushBatch(rowBuffer)
    rowBuffer = []
  }
}

await flushBatch(rowBuffer)
console.log(`\n   ↳ Parsed ${totalRows} rows → inserted ${insertedRows}, failed ${failedRows}`)

// ─── Delete stale rows from previous days ────────────────────────────────────

console.log('🧹  Removing previous days...')
const { error: deleteError } = await supabase
  .from('gtfs_stop_times')
  .delete()
  .neq('service_date', todayIso)

if (deleteError) {
  console.warn('   ⚠️  Could not delete old rows:', deleteError.message)
} else {
  console.log('   ↳ Done')
}

console.log(`\n🎉  Horarios seeded for ${todayIso}: ${insertedRows} rows`)
