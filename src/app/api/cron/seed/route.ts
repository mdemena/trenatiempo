import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { importStations } from '@/lib/renfe/gtfs-import/stations'
import { importHorarios } from '@/lib/renfe/gtfs-import/horarios'
import type { HorarioFeedDetail } from '@/lib/renfe/gtfs-import/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

 
type AnyRow = Record<string, any>

type SeedTable =
  | 'stations'
  | 'gtfs_services'
  | 'gtfs_service_exceptions'
  | 'gtfs_trips'
  | 'gtfs_stop_times'

/** Upserts rows in batches, returning { inserted, failed }. */
async function upsertBatched(
  table: SeedTable,
  rows: AnyRow[],
  onConflict: string
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0
  let failed = 0
  if (rows.length === 0) return { inserted, failed }

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabaseAdmin.from(table).upsert(batch as never, { onConflict })
    if (error) {
      console.error(`${table} batch ${i} error:`, error.message)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  return { inserted, failed }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isAuthorized =
    !!request.headers.get('x-vercel-cron') ||
    (cronSecret && (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret))

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const logs: string[] = []

  try {
    logs.push('Starting GTFS seed...')

    // ── Stations ─────────────────────────────────────────────────────────────
    const stationResult = await importStations()
    logs.push(`Stations: ${stationResult.count} parsed`)

    let stationsInserted = 0
    let stationsFailed = 0
    if (stationResult.count > 0) {
      const res = await upsertBatched('stations', stationResult.stations as unknown as AnyRow[], 'id')
      stationsInserted = res.inserted
      stationsFailed = res.failed
      logs.push(`Stations upserted: ${stationsInserted}, failed: ${stationsFailed}`)
    }

    // ── Horarios (full feed coverage window) ────────────────────────────────
    const horarioResult = await importHorarios()
    logs.push(
      `Horarios parsed: ${horarioResult.servicesCount} services, ` +
        `${horarioResult.exceptionsCount} exceptions, ` +
        `${horarioResult.tripsCount} trips, ` +
        `${horarioResult.totalStopTimes} stop times`
    )

    // Insert order matters (FKs): services → exceptions/trips → stop_times.
    const servicesRes = await upsertBatched(
      'gtfs_services',
      horarioResult.serviceRows as unknown as AnyRow[],
      'service_id,feed_source'
    )
    logs.push(`Services upserted: ${servicesRes.inserted}, failed: ${servicesRes.failed}`)

    const [exceptionsRes, tripsRes] = await Promise.all([
      upsertBatched(
        'gtfs_service_exceptions',
        horarioResult.exceptionRows as unknown as AnyRow[],
        'service_id,feed_source,exception_date'
      ),
      upsertBatched('gtfs_trips', horarioResult.tripRows as unknown as AnyRow[], 'trip_id'),
    ])
    logs.push(`Exceptions upserted: ${exceptionsRes.inserted}, failed: ${exceptionsRes.failed}`)
    logs.push(`Trips upserted: ${tripsRes.inserted}, failed: ${tripsRes.failed}`)

    // Per-feed stop-time counters
    const feedCounts = new Map<string, { inserted: number; failed: number }>()
    for (const f of horarioResult.feeds) feedCounts.set(f.source, { inserted: 0, failed: 0 })

    let stopTimesInserted = 0
    let stopTimesFailed = 0
    if (horarioResult.totalStopTimes > 0) {
      const BATCH = 500
      for (let i = 0; i < horarioResult.stopTimeRows.length; i += BATCH) {
        const batch = horarioResult.stopTimeRows.slice(i, i + BATCH)
        const { error } = await supabaseAdmin
          .from('gtfs_stop_times')
          .upsert(batch as never, { onConflict: 'trip_id,stop_id' })
        if (error) {
          console.error(`Stop times batch ${i} error:`, error.message)
          stopTimesFailed += batch.length
          for (const row of batch) {
            const c = feedCounts.get(row.feed_source)
            if (c) c.failed++
          }
        } else {
          stopTimesInserted += batch.length
          for (const row of batch) {
            const c = feedCounts.get(row.feed_source)
            if (c) c.inserted++
          }
        }
      }
      logs.push(`Stop times upserted: ${stopTimesInserted}, failed: ${stopTimesFailed}`)
    }

    // ── Cleanup: drop expired services (cascades to trips + stop_times) ────
    const today = todayISO()
    const { data: expired, error: expErr } = await supabaseAdmin
      .from('gtfs_services')
      .select('service_id')
      .lt('end_date', today)

    if (expErr) {
      logs.push(`Cleanup lookup error: ${expErr.message}`)
    } else if (expired && expired.length > 0) {
      const ids = (expired as Array<{ service_id: string }>).map((s) => s.service_id)
      let deleted = 0
      const DEL_BATCH = 500
      for (let i = 0; i < ids.length; i += DEL_BATCH) {
        const { error } = await supabaseAdmin
          .from('gtfs_services')
          .delete()
          .in('service_id', ids.slice(i, i + DEL_BATCH))
          .lt('end_date', today)
        if (error) {
          logs.push(`Cleanup delete error: ${error.message}`)
          break
        }
        deleted += Math.min(DEL_BATCH, ids.length - i)
      }
      logs.push(`Expired services deleted: ${deleted}`)
    } else {
      logs.push('No expired services to clean up')
    }

    // Attach counts back to feed details
    const feeds: HorarioFeedDetail[] = horarioResult.feeds.map((f: HorarioFeedDetail) => {
      const counts = feedCounts.get(f.source)
      return {
        ...f,
        rowsInserted: counts?.inserted ?? 0,
        rowsFailed: counts?.failed ?? 0,
      }
    })

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    logs.push(`Done in ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      elapsed: `${elapsed}s`,
      coverage: {
        start: horarioResult.feeds.find((f) => f.coverageStart)?.coverageStart ?? null,
        end: horarioResult.feeds.reduce<string | null>(
          (max, f) => (f.coverageEnd && (!max || f.coverageEnd > max) ? f.coverageEnd : max),
          null
        ),
      },
      stations: { parsed: stationResult.count, inserted: stationsInserted, failed: stationsFailed },
      services: servicesRes,
      exceptions: exceptionsRes,
      trips: tripsRes,
      stopTimes: { parsed: horarioResult.totalStopTimes, inserted: stopTimesInserted, failed: stopTimesFailed },
      feeds,
      failures: [...stationResult.failures, ...horarioResult.failures],
      logs,
    })
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.error('Seed cron failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error', elapsed: `${elapsed}s`, logs },
      { status: 500 }
    )
  }
}
