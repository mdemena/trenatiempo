import { NextResponse } from 'next/server'
import { runPushMonitor } from '@/lib/push/monitor-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vercel Cron invoca con GET; POST se mantiene para triggers manuales (p.ej.
// `curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/monitor-push`).
export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'

  try {
    const result = await runPushMonitor({ dryRun })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[push-monitor] cron failed:', err)
    const message =
      err instanceof Error && /Supabase misconfigured/.test(err.message)
        ? 'Configuración de base de datos incompleta en el servidor.'
        : 'Error al ejecutar el monitor de push.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}