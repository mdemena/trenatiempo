#!/usr/bin/env node
/**
 * Enrich the `stations` table with administrative geography (province, region,
 * municipality) using OFFLINE reverse geocoding (point-in-polygon) on three
 * open datasets. No external API / no API key.
 *
 * Datasets (cached in scripts/data/ after the first run):
 *   1. Provinces      → click_that_hood spain-provinces.geojson (names in props)
 *   2. Municipalities → gist carlostxm spain-municipalities.json (TopoJSON, INE codes)
 *   3. INE catalog    → ByMykel/spanish-cities cities.json (INE code → name)
 *
 * Writes: stations.province, stations.region, stations.municipality
 *
 * Usage:
 *   node scripts/enrich-stations.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 * System deps: curl (to download the datasets on first run)
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(ROOT, '.env')

const DATA_DIR = join(ROOT, 'scripts', 'data')
const FILES = {
  provinces: join(DATA_DIR, 'spain-provinces.geojson'),
  topo: join(DATA_DIR, 'spain-municipalities.topojson'),
  cities: join(DATA_DIR, 'ine-cities.json'),
}
const URLS = {
  provinces: 'https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/spain-provinces.geojson',
  topo: 'https://gist.githubusercontent.com/carlostxm/2f2382656751ae6d85fc35fff118b921/raw/spain-municipalities.json',
  cities: 'https://raw.githubusercontent.com/ByMykel/spanish-cities/main/src/data/cities.json',
}

// ─── Load env vars (system > .env) ───────────────────────────────────────────
let SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL']
let SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']
if ((!SUPABASE_URL || !SUPABASE_KEY) && existsSync(envPath)) {
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
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ─── Dataset acquisition ─────────────────────────────────────────────────────
function ensureFile(key) {
  if (!existsSync(FILES[key])) {
    mkdirSync(DATA_DIR, { recursive: true })
    console.log(`⬇️  Descargando ${key} …`)
    execSync(`curl -fsSL "${URLS[key]}" -o "${FILES[key]}"`, { stdio: ['pipe', 'inherit', 'pipe'] })
  }
}
for (const key of ['provinces', 'topo', 'cities']) ensureFile(key)

// ─── Point-in-polygon (even-odd rule) ────────────────────────────────────────
function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function pointInPolygon(lng, lat, coords) {
  if (!pointInRing(lng, lat, coords[0])) return false
  for (const hole of coords.slice(1)) if (pointInRing(lng, lat, hole)) return false
  return true
}

// ─── TopoJSON decode ─────────────────────────────────────────────────────────
function decodeTopo(topology) {
  const { transform, arcs } = topology
  const decodedArcs = arcs.map((arc) => {
    let x = 0, y = 0
    return arc.map((p) => {
      x += p[0]; y += p[1]
      return [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]]
    })
  })
  // Decode a multi-line geometry (arc indices can be negative = reversed).
  function decodeArcIndices(indices) {
    const pts = []
    for (const idx of indices) {
      const a = idx < 0 ? decodedArcs[~idx].slice().reverse() : decodedArcs[idx]
      pts.push(...a)
    }
    return pts
  }
  // `arcs` of a Polygon = list of rings (exterior + holes); each ring is a list
  // of arc indices. For MultiPolygon, `arcs` = list of polygon-rings-groups.
  function geometryToPolygons(geom) {
    if (geom.type === 'Polygon') return [geom.arcs.map(decodeArcIndices)]
    if (geom.type === 'MultiPolygon') return geom.arcs.map((rings) => rings.map(decodeArcIndices))
    // LineString/MultiLineString: no area, skip
    return []
  }
  return geometryToPolygons
}

// ─── Load data ───────────────────────────────────────────────────────────────
// Provinces (id → name, ccaa id)
const provGeo = JSON.parse(readFileSync(FILES.provinces, 'utf8'))
const provFeats = provGeo.features ?? []
// Municipality TopoJSON
const topo = JSON.parse(readFileSync(FILES.topo, 'utf8'))
const decodePolygons = decodeTopo(topo)
const muniGeoms = topo.objects.municipalities.geometries
const decRegionPoly = decodeTopo(topo)
const regionGeoms = topo.objects.autonomous_regions.geometries

// INE catalog: 5-digit code → municipality name; ccaa code → name
const cityRows = JSON.parse(readFileSync(FILES.cities, 'utf8'))
const muniNameByCode = new Map()
const ccaaNameById = new Map()
for (const [code6, name, ccaaId] of cityRows) {
  if (!muniNameByCode.has(code6.slice(0, 5))) muniNameByCode.set(code6.slice(0, 5), name)
  ccaaNameById.set(ccaaId, ccaaId) // kept as fallback (row alone has no ccaa name)
}
// Autonomous region names (from provinces geojson ccaa? that only gives code) →
// use autonmicias via a small static map from autonomies.json positions: we only
// have ccaa id here; fetch nombres from the byMykel autonomies.json below.
// ─── Fetch ccaa names ────────────────────────────────────────────────────────
{
  const aut = JSON.parse(
    (() => {
      const path = join(DATA_DIR, 'autonomies.json')
      if (!existsSync(path)) {
        mkdirSync(DATA_DIR, { recursive: true })
        execSync(`curl -fsSL "https://raw.githubusercontent.com/ByMykel/spanish-cities/main/src/data/autonomies.json" -o "${path}"`, { stdio: ['pipe', 'inherit', 'pipe'] })
      }
      return readFileSync(path, 'utf8')
    })()
  )
  for (const [id, name] of aut) ccaaNameById.set(id, name)
}

// ─── Reverse geocoding ───────────────────────────────────────────────────────
function provinceHit(lng, lat) {
  for (const f of provFeats) {
    const coords = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.coordinates
    if (!coords) continue
    for (const polys of coords) if (pointInPolygon(lng, lat, polys)) {
      return f.properties?.name ?? null
    }
  }
  return null
}
function regionHit(lng, lat) {
  for (const g of regionGeoms) {
    const polys = decRegionPoly(g)
    for (const p of polys) if (pointInPolygon(lng, lat, p)) {
      return ccaaNameById.get(String(g.id).padStart(2, '0')) ?? ccaaNameById.get(String(g.id)) ?? null
    }
  }
  return null
}
function municipalityHit(lng, lat) {
  for (const g of muniGeoms) {
    const polys = decodePolygons(g)
    for (const p of polys) if (pointInPolygon(lng, lat, p)) {
      return muniNameByCode.get(String(g.id)) ?? String(g.id)
    }
  }
  return null
}

// ─── Fetch all stations ──────────────────────────────────────────────────────
let all = []
// Supabase devuelve como mucho 1000 filas por request: paginar en pasos de ≤1000.
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('stations')
    .select('id, name, lat, lng, province, municipality, region')
    .range(from, from + 999)
  if (error) { console.error('❌  Error leyendo estaciones:', error.message); process.exit(1) }
  all.push(...(data ?? []))
  if ((data ?? []).length < 1000) break
}
console.log(`🚉  ${all.length} estaciones leídas`)

// ─── Enrich ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run')
let updated = 0, skipped = 0, noGeo = 0
const BATCH = 20
for (let i = 0; i < all.length; i += BATCH) {
  await Promise.all(all.slice(i, i + BATCH).map(async (s) => {
    if (s.lat == null || s.lng == null) { noGeo++; return }
    const prov = provinceHit(s.lng, s.lat)
    const region = regionHit(s.lng, s.lat)
    const muni = municipalityHit(s.lng, s.lat)
    if (!prov && !region && !muni) { skipped++; return }
    if (DRY_RUN) {
      const known = ['60000', '79104', '79100', '51003', '60100', '71801', '71802', '05451', '10000', '79400', '13200', '97201'].includes(s.id)
      if (i === 0 || known) console.log(`  [dry] ${s.name} (${s.id}) → prov:${prov ?? '-'} | region:${region ?? '-'} | muni:${muni ?? '-'}`)
      updated++
      return
    }
    const { error } = await supabase.from('stations').update({
      province: prov ?? s.province,
      region: region ?? s.region,
      municipality: muni ?? s.municipality,
    }).eq('id', s.id)
    if (error) console.error(`  ⚠️  ${s.id} ${s.name}:`, error.message)
    else updated++
  }))
  if (i % 400 === 0) console.log(`  … ${i}/${all.length} (${updated} ok)`)
}

console.log(`\n✔️  Hecho: ${updated} actualizadas, ${skipped} sin coincidencia geo, ${noGeo} sin coordenadas.`)
process.exit(0)