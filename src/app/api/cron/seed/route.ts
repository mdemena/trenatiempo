import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { importStations } from '@/lib/renfe/gtfs-import/stations'
import { importHorarios } from '@/lib/renfe/gtfs-import/horarios'
import type { HorarioFeedDetail } from '@/lib/renfe/gtfs-import/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

    const stationResult = await importStations()
    logs.push(`Stations: ${stationResult.count} parsed`)

    let stationsInserted = 0
    let stationsFailed = 0
    if (stationResult.count > 0) {
      const BATCH = 100
      for (let i = 0; i < stationResult.stations.length; i += BATCH) {
        const batch = stationResult.stations.slice(i, i + BATCH)
        const { error } = await supabaseAdmin.from('stations').upsert(batch as any, { onConflict: 'id' })
        if (error) {
          console.error(`Station batch ${i} error:`, error.message)
          stationsFailed += batch.length
        } else {
          stationsInserted += batch.length
        }
      }
      logs.push(`Stations upserted: ${stationsInserted}, failed: ${stationsFailed}`)
    }

    const horarioResult = await importHorarios()
    logs.push(`Horarios: ${horarioResult.totalRows} parsed`)

    // Init per-feed upsert counters from parsed counts
    const feedCounts = new Map<string, { inserted: number; failed: number }>()
    for (const f of horarioResult.feeds) {
      feedCounts.set(f.source, { inserted: 0, failed: 0 })
    }

    let horariosInserted = 0
    let horariosFailed = 0
    if (horarioResult.totalRows > 0) {
      const BATCH = 500
      for (let i = 0; i < horarioResult.rows.length; i += BATCH) {
        const batch = horarioResult.rows.slice(i, i + BATCH)
        const { error } = await supabaseAdmin
          .from('gtfs_stop_times')
          .upsert(batch as any, { onConflict: 'trip_id,stop_id,service_date' })
        if (error) {
          console.error(`Stop times batch ${i} error:`, error.message)
          horariosFailed += batch.length
          for (const row of batch) {
            const c = feedCounts.get(row.feed_source)
            if (c) c.failed++
          }
        } else {
          horariosInserted += batch.length
          for (const row of batch) {
            const c = feedCounts.get(row.feed_source)
            if (c) c.inserted++
          }
        }
      }
      logs.push(`Horarios upserted: ${horariosInserted}, failed: ${horariosFailed}`)

      const { error: delErr } = await supabaseAdmin
        .from('gtfs_stop_times')
        .delete()
        .neq('service_date', horarioResult.serviceDate)
      if (delErr) logs.push(`Cleanup error: ${delErr.message}`)
      else logs.push('Stale horarios cleaned up')
    }

    // Attach upsert counts back to feed details
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
      serviceDate: horarioResult.serviceDate,
      stations: { parsed: stationResult.count, inserted: stationsInserted, failed: stationsFailed },
      horarios: { parsed: horarioResult.totalRows, inserted: horariosInserted, failed: horariosFailed },
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
