import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { importStations } from '@/lib/renfe/gtfs-import/stations'
import { importHorarios } from '@/lib/renfe/gtfs-import/horarios'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!request.headers.get('x-vercel-cron')) {
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
        } else {
          horariosInserted += batch.length
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

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    logs.push(`Done in ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      elapsed: `${elapsed}s`,
      stations: { parsed: stationResult.count, inserted: stationsInserted, failed: stationsFailed },
      horarios: { parsed: horarioResult.totalRows, inserted: horariosInserted, failed: horariosFailed },
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
