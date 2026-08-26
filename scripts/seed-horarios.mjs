#!/usr/bin/env node
/**
 * Seed the full schedule coverage window into Supabase from Renfe GTFS feeds.
 *
 * New calendar-based model:
 *   - calendar.txt       → gtfs_services
 *   - calendar_dates.txt → gtfs_service_exceptions
 *   - trips.txt          → gtfs_trips
 *   - stop_times.txt     → gtfs_stop_times (date-independent)
 *
 * Coverage observed (Aug 2026): Cercanías ~30 days ahead,
 * AV/LD/MD ~4 months ahead.
 *
 * Usage:
 *   node scripts/seed-horarios.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * System deps: curl, python3
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

let SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL']
let SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Prefer .env.local over .env (Next.js convention)
  const envLocalPath = join(ROOT, '.env.local')
  const envPath = join(ROOT, '.env')
  const envFile = existsSync(envLocalPath) ? envLocalPath : envPath

  if (!existsSync(envFile)) {
    console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env.local')
    process.exit(1)
  }

  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
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
const BATCH_SIZE = 2000

mkdirSync(TMP, { recursive: true })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/** "20260822" → "2026-08-22", or null. */
function yyyymmddToIso(v) {
  if (!/^\d{8}$/.test(v)) return null
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso
}

/** Parse CSV text into array of objects with trimmed keys/values. */
function parseCsvObjects(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter((l) => l.trim() !== '')
  const headers = (lines[0] ?? '').split(',').map((h) => h.trim())
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const rec = {}
    for (let j = 0; j < headers.length; j++) rec[headers[j]] = (cols[j] ?? '').trim()
    out.push(rec)
  }
  return out
}

async function upsertBatched(table, rows, onConflict) {
  let inserted = 0
  let failed = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (error) {
      failed += batch.length
      console.error(`   ⚠️  ${table} batch ${i}: ${error.message}`)
    } else {
      inserted += batch.length
    }
    process.stdout.write(`\r   ↳ ${table}: ${inserted} inserted...`)
  }
  process.stdout.write('\n')
  return { inserted, failed }
}

/**
 * Process one GTFS feed: download, extract, parse into calendar model.
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

  if (zipAge < 6 * 60 * 60 * 1000) {
    console.log(`📦  [${feed.name}] Using cached GTFS zip (${Math.round(zipAge / 60000)} min old)`)
  } else {
    console.log(`📥  [${feed.name}] Downloading GTFS...`)
    execSync(`curl -sL --max-time 120 -c "${COOKIES}" -b "${COOKIES}" -o "${zipPath}" "${feed.url}"`)
    console.log('   ↳ Done')
  }

  // ─── Extract needed files ───────────────────────────────────────────────

  console.log(`📦  [${feed.name}] Extracting GTFS files...`)
  const pyExtract = join(feedDir, 'extract.py')
  const filesToExtract = ['calendar.txt', 'calendar_dates.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']

  writeFileSync(
    pyExtract,
    `import zipfile, os
zip_path = ${JSON.stringify(zipPath)}
dest = ${JSON.stringify(extractDir)}
files = ${JSON.stringify(filesToExtract)}
with zipfile.ZipFile(zip_path) as z:
    names = z.namelist()
    for f in files:
        # Match both "calendar.txt" and "GTFS/calendar.txt" (subdirectory)
        for name in names:
            basename = name.rsplit('/', 1)[-1] if '/' in name else name
            if basename == f:
                data = z.read(name)
                os.makedirs(dest, exist_ok=True)
                with open(os.path.join(dest, f), 'wb') as out:
                    out.write(data)
                break
`
  )
  execSync(`python3 "${pyExtract}"`, { stdio: 'pipe' })

  const summary = { services: 0, exceptions: 0, trips: 0, stopTimes: 0, start: null, end: null }
  const serviceRows = []
  const exceptionRows = []
  const tripRows = []

  // ─── calendar.txt → services ────────────────────────────────────────────

  const calPath = join(extractDir, 'calendar.txt')
  if (!existsSync(calPath)) {
    console.log(`   ⚠️  [${feed.name}] No calendar.txt — skipping`)
    return summary
  }

  console.log(`   🗓   [${feed.name}] Parsing calendar.txt...`)
  const serviceIds = new Set()

  for (const row of parseCsvObjects(readFileSync(calPath, 'utf8'))) {
    const serviceId = row['service_id']
    const start = yyyymmddToIso(row['start_date'])
    const end = yyyymmddToIso(row['end_date'])
    if (!serviceId || !start || !end) continue

    serviceIds.add(serviceId)
    summary.services++
    if (!summary.start || start < summary.start) summary.start = start
    if (!summary.end || end > summary.end) summary.end = end

    serviceRows.push({
      service_id: serviceId,
      feed_source: feed.source,
      start_date: start,
      end_date: end,
      monday: row['monday'] === '1',
      tuesday: row['tuesday'] === '1',
      wednesday: row['wednesday'] === '1',
      thursday: row['thursday'] === '1',
      friday: row['friday'] === '1',
      saturday: row['saturday'] === '1',
      sunday: row['sunday'] === '1',
    })
  }

  if (serviceIds.size === 0) {
    console.log(`   ⚠️  [${feed.name}] No services parsed — skipping`)
    return summary
  }

  // ─── calendar_dates.txt → exceptions (optional) ─────────────────────────

  const calDatesPath = join(extractDir, 'calendar_dates.txt')
  if (existsSync(calDatesPath)) {
    console.log(`   🗒   [${feed.name}] Parsing calendar_dates.txt...`)
    for (const row of parseCsvObjects(readFileSync(calDatesPath, 'utf8'))) {
      const serviceId = row['service_id']
      const date = yyyymmddToIso(row['date'])
      const type = parseInt(row['exception_type'], 10)
      if (!serviceId || !date || (type !== 1 && type !== 2)) continue
      if (!serviceIds.has(serviceId)) continue

      summary.exceptions++
      exceptionRows.push({
        service_id: serviceId,
        feed_source: feed.source,
        exception_date: date,
        exception_type: type,
      })
    }
  }

  // ─── trips.txt → trip/service mapping ──────────────────────────────────

  console.log(`   🗂   [${feed.name}] Parsing trips.txt...`)

  const routeShortNames = new Map()
  const routesPath = join(extractDir, 'routes.txt')
  if (existsSync(routesPath)) {
    for (const r of parseCsvObjects(readFileSync(routesPath, 'utf8'))) {
      if (r['route_id'] && r['route_short_name']) routeShortNames.set(r['route_id'], r['route_short_name'])
    }
  } else {
    console.log(`   ⚠️  [${feed.name}] No routes.txt — using raw route_id`)
  }

  const tripIds = new Set()
  for (const t of parseCsvObjects(readFileSync(join(extractDir, 'trips.txt'), 'utf8'))) {
    const tripId = t['trip_id']
    const serviceId = t['service_id']
    if (!tripId || !serviceId || !serviceIds.has(serviceId)) continue

    tripIds.add(tripId)
    summary.trips++
    tripRows.push({
      trip_id: tripId,
      service_id: serviceId,
      route_id: routeShortNames.get(t['route_id']) ?? t['route_id'] ?? '',
      feed_source: feed.source,
    })
  }

  if (tripIds.size === 0) {
    console.log(`   ⚠️  [${feed.name}] No active trips — skipping`)
    return summary
  }

  // ─── Upsert calendar tables FIRST (stop_times has FK to gtfs_trips) ────

  console.log(`   💾  [${feed.name}] Upserting services / exceptions / trips...`)
  await upsertBatched('gtfs_services', serviceRows, 'service_id,feed_source')
  if (exceptionRows.length > 0) {
    await upsertBatched('gtfs_service_exceptions', exceptionRows, 'service_id,feed_source,exception_date')
  }
  const tripsRes = await upsertBatched('gtfs_trips', tripRows, 'trip_id')
  if (tripsRes.failed > 0) {
    console.log(`   ⚠️  [${feed.name}] ${tripsRes.failed} trips failed — their stop times will fail too`)
  }

  // ─── Stream stop_times.txt, filter by known trip_ids ────────────────────

  const stopTimesPath = join(extractDir, 'stop_times.txt')
  if (!existsSync(stopTimesPath)) {
    console.log(`   ⚠️  [${feed.name}] No stop_times.txt — skipping`)
    return summary
  }

  console.log(`   🚂  [${feed.name}] Streaming stop_times.txt...`)

  const rl = createInterface({ input: createReadStream(stopTimesPath), crlfDelay: Infinity })

  let stHeaders = null
  let colST = {}
  let rowBuffer = []
  let totalRows = 0
  let insertedRows = 0
  let failedRows = 0

  // Map trip_id → route_id from parsed trips
  const routeByTrip = new Map(tripRows.map((t) => [t.trip_id, t.route_id]))

  async function flushBatch(rows) {
    if (rows.length === 0) return
    const { error } = await supabase
      .from('gtfs_stop_times')
      .upsert(rows, { onConflict: 'trip_id,stop_id' })
    if (error) {
      failedRows += rows.length
    } else {
      insertedRows += rows.length
    }
    process.stdout.write(`\r   ↳ ${insertedRows} rows inserted...`)
  }

  for await (const line of rl) {
    if (!stHeaders) {
      stHeaders = line.split(',').map((h) => h.trim().replace(/"/g, ''))
      colST = {
        tripId: stHeaders.indexOf('trip_id'),
        stopId: stHeaders.indexOf('stop_id'),
        stopSeq: stHeaders.indexOf('stop_sequence'),
        departure: stHeaders.indexOf('departure_time'),
        arrival: stHeaders.indexOf('arrival_time'),
      }
      continue
    }

    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''))
    const tripId = cols[colST.tripId]
    if (!tripIds.has(tripId)) continue

    const departure = cols[colST.departure] || cols[colST.arrival]
    if (!departure) continue

    totalRows++
    rowBuffer.push({
      trip_id: tripId,
      route_id: routeByTrip.get(tripId) ?? '',
      stop_id: cols[colST.stopId],
      stop_sequence: parseInt(cols[colST.stopSeq], 10) || 0,
      departure_time: departure,
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

  summary.stopTimes = insertedRows

  return summary
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`📅  Seed horarios started — today: ${todayISO()}`)

const totals = { services: 0, exceptions: 0, trips: 0, stopTimes: 0, start: null, end: null }

for (const feed of FEEDS) {
  console.log(`\n═══ Processing feed: ${feed.name} ═══`)
  const s = await processFeed(feed)
  totals.services += s.services
  totals.exceptions += s.exceptions
  totals.trips += s.trips
  totals.stopTimes += s.stopTimes
  if (!totals.start || (s.start && s.start < totals.start)) totals.start = s.start
  if (!totals.end || (s.end && s.end > totals.end)) totals.end = s.end
}

console.log(
  `\n🎉  Done — ${totals.services} services, ${totals.exceptions} exceptions, ` +
    `${totals.trips} trips, ${totals.stopTimes} stop times | coverage: ${totals.start} → ${totals.end}`
)

// ─── Cleanup: drop expired services (cascades to trips + stop_times) ────────

console.log('\n🧹  Removing expired services...')
const today = todayISO()
const { data: expired, error: expErr } = await supabase
  .from('gtfs_services')
  .select('service_id')
  .lt('end_date', today)

if (expErr) {
  console.warn('   ⚠️  Cleanup lookup failed:', expErr.message)
} else if (expired && expired.length > 0) {
  const ids = expired.map((s) => s.service_id)
  let deleted = 0
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('gtfs_services')
      .delete()
      .in('service_id', ids.slice(i, i + BATCH_SIZE))
      .lt('end_date', today)
    if (error) {
      console.warn('   ⚠️  Delete failed:', error.message)
      break
    }
    deleted += Math.min(BATCH_SIZE, ids.length - i)
  }
  console.log(`   ↳ Deleted ${deleted} expired services`)
} else {
  console.log('   ↳ Nothing to delete')
}
