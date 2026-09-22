#!/usr/bin/env node
/**
 * Cleanup cron (migrado de /api/cron/cleanup a GitHub Actions):
 *   - Borra filas de `adif_cache` expiradas.
 *   - Borra suscripciones push inactivas con más de 30 días.
 *
 * Uso:
 *   node scripts/cleanup.mjs
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en entorno o .env
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const envPath = join(ROOT, '.env')

let SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL']
let SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  if (!existsSync(envPath)) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env')
    process.exit(1)
  }

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = val
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_KEY = val
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const now = new Date().toISOString()
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

const [cacheRes, subsRes] = await Promise.all([
  supabase.from('adif_cache').delete().lt('expires_at', now).select('key'),
  supabase
    .from('push_subscriptions')
    .delete()
    .eq('active', false)
    .lt('created_at', thirtyDaysAgo)
    .select('id'),
])

if (cacheRes.error) {
  console.error('adif_cache cleanup error:', cacheRes.error.message)
  process.exit(1)
}
if (subsRes.error) {
  console.error('push_subscriptions cleanup error:', subsRes.error.message)
  process.exit(1)
}

console.log(`Deleted cache rows: ${cacheRes.data?.length ?? 0}`)
console.log(`Deleted inactive subscriptions: ${subsRes.data?.length ?? 0}`)