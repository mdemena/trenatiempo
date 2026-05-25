#!/usr/bin/env node
/**
 * Seed today's departure schedule into `gtfs_stop_times` from Renfe GTFS feeds.
 *
 * Processes two feeds:
 *   1. Cercanías  → https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip
 *   2. AV/LD/MD   → https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip
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

// ─── Load env vars (system > .env file) ──────────────────────────────────────

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const envPath = join(ROOT, '.env')

let SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL']
let SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  if (!existsSync(envPath)) {
    console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env')
    process.exit(1)
  }

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    const key = trimmed.slice(0, eqIdx).trim()
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = val
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_KEY = val
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── Constants ────────────────────────────────────────────────────────────────

const FEEDS = [
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

const TMP = join(tmpdir(), 'trenatiempo-gtfs')
const COOKIES = join(TMP, 'cookies.txt')
const BATCH_SIZE = 500

mkdirSync(TMP, { recursive: true })

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayYYYYMMDD() {
  return new Date().toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('')
}

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

function getDayOfWeek() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
  }).toLowerCase()
}

const SIX_HOURS = 6 * 60 * 60 * 1000
const today = todayYYYYMMDD()
const todayIso = todayISO()
const dow = getDayOfWeek()

console.log(`📅  Today: ${todayIso} (${dow})`)

/**
 * Process one GTFS feed: download, parse, insert into gtfs_stop_times.
 */
async function processFeed(feed) {
  const safeName = feed.name.replace(/[^a-zA-Z0-9]/g, '_')
  const feedDir = join(TMP, safeName)
  const zipPath = join(TMP, `${safeName}.zip`)
  const extractDir = join(feedDir, 'extracted')

  mkdirSync(extractDir, { recursive: true })

  // ─── Download GTFS zip (skip if cached < 6 h) ──────────────────────────

  const zipExists = existsSync(zipPath)
  const zipAge = zipExists ? Date.now() - statSync(zipPath).mtimeMs : Infinity

  if (zipAge < SIX_HOURS) {
    console.log(`📦  [${feed.name}] Using cached GTFS zip (${Math.round(zipAge / 60000)} min old)`)
  } else {
    console.log(`📥  [${feed.name}] Downloading GTFS...`)
    execSync(`curl -sL --max-time 120 -c "${COOKIES}" -b "${COOKIES}" -o "${zipPath}" "${feed.url}"`)
    console.log(`   ↳ Done`)
  }

  // ─── Extract needed files ───────────────────────────────────────────────

  console.log(`📦  [${feed.name}] Extracting GTFS files...`)
  const pyExtract = join(feedDir, 'extract.py')
  const filesToExtract = ['calendar.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']

  writeFileSync(
    pyExtract,
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
  execSync(`python3 "${pyExtract}"`, { stdio: 'pipe' })

  // ─── Parse calendar.txt → active service_id for today ──────────────────

  const calPath = join(extractDir, 'calendar.txt')
  if (!existsSync(calPath)) {
    console.log(`   ⚠️  [${feed.name}] No calendar.txt — skipping`)
    return 0
  }

  const calendarLines = readFileSync(calPath, 'utf8').trim().split('\n')
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

  console.log(`   ↳ [${feed.name}] Active service_ids: ${activeServiceIds.size} — ${[...activeServiceIds].join(', ')}`)

  if (activeServiceIds.size === 0) {
    console.log(`   ⚠️  [${feed.name}] No active service_ids for today — skipping`)
    return 0
  }

  // ─── Parse routes.txt → Map<route_id, route_short_name> ─────────────────

  const routeLines = readFileSync(join(extractDir, 'routes.txt'), 'utf8').trim().split('\n')
  const routeHeaders = routeLines[0].split(',').map((h) => h.trim().replace(/"/g, ''))
  const colRId = routeHeaders.indexOf('route_id')
  const colShortName = routeHeaders.indexOf('route_short_name')

  const routeShortNames = new Map()
  for (let i = 1; i < routeLines.length; i++) {
    const cols = routeLines[i].split(',').map((c) => c.trim().replace(/"/g, ''))
    const rId = cols[colRId]
    const short = cols[colShortName]
    if (rId && short) routeShortNames.set(rId, short)
  }
  console.log(`   ↳ [${feed.name}] ${routeShortNames.size} routes loaded`)

  // ─── Parse trips.txt → Map<trip_id, route_short_name> for active trips ─

  console.log(`   🗂   [${feed.name}] Building active trip index...`)

  const tripLines = readFileSync(join(extractDir, 'trips.txt'), 'utf8').trim().split('\n')
  const tripHeaders = tripLines[0].split(',').map((h) => h.trim().replace(/"/g, ''))

  const colTripId = tripHeaders.indexOf('trip_id')
  const colRouteId = tripHeaders.indexOf('route_id')
  const colServiceId = tripHeaders.indexOf('service_id')

  const activeTripRoutes = new Map()

  for (let i = 1; i < tripLines.length; i++) {
    const cols = tripLines[i].split(',').map((c) => c.trim().replace(/"/g, ''))
    const serviceId = cols[colServiceId]
    if (!activeServiceIds.has(serviceId)) continue
    const gtfsRouteId = cols[colRouteId] ?? ''
    const shortName = routeShortNames.get(gtfsRouteId) ?? gtfsRouteId
    activeTripRoutes.set(cols[colTripId], shortName)
  }

  console.log(`   ↳ [${feed.name}] Active trips: ${activeTripRoutes.size}`)

  if (activeTripRoutes.size === 0) {
    console.log(`   ⚠️  [${feed.name}] No active trips — skipping`)
    return 0
  }

  // ─── Stream stop_times.txt, filter active trips ─────────────────────────

  console.log(`   🚂  [${feed.name}] Streaming stop_times.txt...`)

  const stopTimesPath = join(extractDir, 'stop_times.txt')
  if (!existsSync(stopTimesPath)) {
    console.log(`   ⚠️  [${feed.name}] No stop_times.txt — skipping`)
    return 0
  }

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
    process.stdout.write(`\r   ↳ ${insertedRows} rows inserted...`)
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
        feed_source: feed.source,
      })

    if (rowBuffer.length >= BATCH_SIZE) {
      await flushBatch(rowBuffer)
      rowBuffer = []
    }
  }

  rl.close()

  await flushBatch(rowBuffer)
  console.log(`\n   ↳ [${feed.name}] Parsed ${totalRows} rows → inserted ${insertedRows}, failed ${failedRows}`)

  return insertedRows
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let totalInserted = 0

for (const feed of FEEDS) {
  console.log(`\n═══ Processing feed: ${feed.name} ═══`)
  const inserted = await processFeed(feed)
  totalInserted += inserted
}

// ─── Delete stale rows from previous days ────────────────────────────────────

console.log('\n🧹  Removing previous days...')
const { error: deleteError } = await supabase
  .from('gtfs_stop_times')
  .delete()
  .neq('service_date', todayIso)

if (deleteError) {
  console.warn('   ⚠️  Could not delete old rows:', deleteError.message)
} else {
  console.log('   ↳ Done')
}

console.log(`\n🎉  Horarios seeded for ${todayIso}: ${totalInserted} rows total`)
