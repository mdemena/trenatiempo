#!/usr/bin/env node
/**
 * Ejecuta el monitor de alertas push localmente (migrado de
 * /api/cron/monitor-push a GitHub Actions). Conecta a la BD real y envía
 * notificaciones vía web-push.
 *
 * Uso:
 *   pnpm monitor:push       # envía notificaciones
 *   pnpm monitor:push:dry   # sin enviar, solo decide
 *   (o directamente: tsx scripts/push-monitor.ts [--dry-run])
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_MAILTO.
 */

import { runPushMonitor } from '@/lib/push/monitor-run'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

// Carga de .env (solo si las env vars no vienen ya del entorno, p.ej. secrets
// de GitHub Actions). Mismo patrón que scripts/seed-stations.mjs.
const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const envPath = join(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    if (process.env[key] === undefined) {
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      process.env[key] = val
    }
  }
}

const dryRun = process.argv.includes('--dry-run')

try {
  const result = await runPushMonitor({ dryRun })
  console.log(`[push-monitor] dryRun=${dryRun}`, JSON.stringify(result))
} catch (err) {
  console.error('[push-monitor] failed:', err)
  process.exit(1)
}