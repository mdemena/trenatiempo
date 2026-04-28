# SKILLS.md — TrenATiempo Development Patterns

> Guías de implementación específicas para el proyecto. Claude Code debe consultar este fichero cuando trabaje en cada área.

---

## SKILL: Integración Renfe Open Data (GTFS / GTFS-RT)

### Contexto
Renfe publica datos oficiales bajo CC Attribution 4.0 en **data.renfe.com**. No requieren autenticación.

Hay dos tipos de datos a combinar:
1. **GTFS estático** (`.zip` con ficheros `.txt`): horarios base, paradas, rutas. Se importan a Supabase y se actualizan con un cron diario/semanal.
2. **GTFS-RT** (JSON o Protocol Buffers): actualizaciones en tiempo real de retrasos, cancelaciones y posición GPS. Se consumen en los Route Handlers con caché TTL corto.

### Endpoints GTFS-RT confirmados

```typescript
// src/lib/renfe/endpoints.ts
export const RENFE_GTFSRT = {
  // Cercanías (actualización cada 20s)
  tripUpdatesCercanias:    'https://gtfsrt.renfe.com/trip_updates.json',
  vehiclePositionsCercanias: 'https://gtfsrt.renfe.com/vehicle_positions.json',

  // Largo Recorrido / Media Distancia (actualización cada 30s)
  // ⚠️ Verificar URLs exactas en: https://data.renfe.com/dataset
  tripUpdatesLD:   'https://gtfsrt.renfe.com/trip_updates_ld.json', // confirmar
  vehiclePositionsLD: 'https://gtfsrt.renfe.com/vehicle_positions_ld.json', // confirmar

  // Avisos e incidencias
  serviceAlerts: 'https://gtfsrt.renfe.com/service_alerts.json', // confirmar
} as const

export const RENFE_GTFS_STATIC = {
  cercanias: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
  // LD/MD: verificar en https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia
} as const
```

### Importar GTFS estático a Supabase (cron)

```typescript
// scripts/import-gtfs.ts — ejecutar como cron en Vercel o GitHub Actions
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'

async function importGtfsCercanias() {
  // 1. Descargar ZIP
  const res = await fetch(RENFE_GTFS_STATIC.cercanias)
  const buffer = Buffer.from(await res.arrayBuffer())
  const zip = new AdmZip(buffer)

  // 2. Parsear stops.txt → tabla stations en Supabase
  const stopsRaw = zip.readAsText('stops.txt')
  const stops = parse(stopsRaw, { columns: true, skip_empty_lines: true })
  
  await supabase.from('stations').upsert(
    stops.map(s => ({
      id: s.stop_id,
      name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lng: parseFloat(s.stop_lon),
    })),
    { onConflict: 'id' }
  )

  // 3. Parsear trips.txt, stop_times.txt, routes.txt si se necesitan horarios base
  // (Los horarios base + GTFS-RT trip_updates = horarios en tiempo real)
}
```

### Consumir GTFS-RT en Route Handler

```typescript
// src/lib/renfe/gtfs-rt.ts
const CACHE_TTL = { cercanias: 20, md: 30 } // segundos

export async function fetchTripUpdates(tipo: 'cercanias' | 'md'): Promise<TripUpdateFeed> {
  const cacheKey = `gtfsrt:trip_updates:${tipo}`
  const ttl = CACHE_TTL[tipo]

  // 1. Caché en Supabase (tabla adif_cache)
  try {
    const { data: cached } = await supabaseAdmin
      .from('adif_cache')
      .select('data, expires_at')
      .eq('key', cacheKey)
      .single()

    if (cached && new Date(cached.expires_at) > new Date()) {
      return cached.data as TripUpdateFeed
    }
  } catch {} // cache miss

  // 2. Fetch GTFS-RT oficial
  const url = tipo === 'cercanias'
    ? RENFE_GTFSRT.tripUpdatesCercanias
    : RENFE_GTFSRT.tripUpdatesLD

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    next: { revalidate: ttl }, // Next.js fetch cache
  })

  if (!res.ok) throw new Error(`GTFS-RT fetch failed: ${res.status}`)
  const feed: GtfsRtFeed = await res.json()

  // 3. Guardar en Supabase
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
  await supabaseAdmin.from('adif_cache').upsert(
    { key: cacheKey, data: feed, expires_at: expiresAt },
    { onConflict: 'key' }
  )

  return feed
}
```

### Combinar GTFS estático + GTFS-RT para horarios de estación

```typescript
// src/app/api/renfe/horarios/route.ts
// GET /api/renfe/horarios?stopId=60000&tipo=cercanias

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const stopId = searchParams.get('stopId')!
  const tipo = searchParams.get('tipo') as 'cercanias' | 'md'

  // 1. Obtener trenes que paran en esta estación (GTFS estático en Supabase)
  // stop_times tiene: trip_id, stop_id, arrival_time, departure_time, stop_sequence
  const { data: stopTimes } = await supabase
    .from('gtfs_stop_times')
    .select('trip_id, departure_time, stop_sequence')
    .eq('stop_id', stopId)
    .gte('departure_time', getCurrentTimeGtfs()) // HH:MM:SS en GTFS
    .order('departure_time')
    .limit(50)

  // 2. Obtener trip_updates GTFS-RT para aplicar retrasos
  const rtFeed = await fetchTripUpdates(tipo)
  const rtByTripId = indexRtByTripId(rtFeed)

  // 3. Combinar
  const horarios = stopTimes.map(st => {
    const rt = rtByTripId[st.trip_id]?.stopTimeUpdate?.find(u => u.stopId === stopId)
    const delaySeg = rt?.departure?.delay ?? 0
    return {
      tripId: st.trip_id,
      salidaProgramada: st.departure_time,
      salidaReal: addSeconds(st.departure_time, delaySeg),
      delaySeg,
      cancelado: rt?.scheduleRelationship === 'CANCELED',
    }
  })

  return Response.json({ horarios, updatedAt: Date.now() })
}
```

### Parsear posición del convoy (vehicle_positions)

```typescript
// Obtener el andén del campo "label": "C1-23537-PLATF.(3)"
function parseAnden(label: string): string | undefined {
  const match = label.match(/PLATF\.\((.+?)\)/)
  return match?.[1]
}

// Determinar en qué parada está el tren ahora mismo
// currentStatus: "IN_TRANSIT_TO" | "STOPPED_AT" | "INCOMING_AT"
function getTripPosition(vehicle: VehiclePosition, paradas: Parada[]) {
  return {
    stopId: vehicle.stopId,
    anden: parseAnden(vehicle.label),
    enMovimiento: vehicle.currentStatus === 'IN_TRANSIT_TO',
    coords: { lat: vehicle.position.latitude, lng: vehicle.position.longitude },
  }
}
```

### Librerías recomendadas

```bash
pnpm add gtfs-utils          # Parsear GTFS estático
pnpm add adm-zip             # Descomprimir GTFS .zip
pnpm add csv-parse           # Parsear .txt del GTFS
pnpm add protobufjs          # Si se usan feeds .pb en vez de .json (más eficiente)
```

---

## SKILL: Autenticación con Supabase

### Setup inicial

```typescript
// src/lib/supabase/client.ts (Browser)
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// src/lib/supabase/server.ts (RSC / Route Handlers)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}
```

### Trigger SQL para crear perfil automáticamente

```sql
-- supabase/migrations/001_profiles.sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'user'  -- siempre 'user' al registrarse
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Protección de rutas admin

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Crear cliente Supabase
  const supabase = createServerClient(...)
  const { data: { user } } = await supabase.auth.getUser()

  // Proteger rutas de app
  if (pathname.startsWith('/(app)') && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Proteger rutas admin
  if (pathname.startsWith('/admin')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/(app)/:path*'],
}
```

---

## SKILL: Geolocalización y Estación Más Cercana

```typescript
// src/hooks/useGeolocation.ts
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    loading: false,
    error: null,
    coords: null,
  })

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocalización no soportada' }))
      return
    }
    setState(s => ({ ...s, loading: true }))
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ loading: false, error: null, coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) => setState({ loading: false, error: err.message, coords: null }),
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  return { ...state, getLocation }
}

// src/lib/geo/nearest-station.ts
// Fórmula Haversine para calcular distancia entre coordenadas
export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function findNearestStations(
  coords: { lat: number; lng: number },
  stations: Estacion[],
  limit = 5
): (Estacion & { distanciaKm: number })[] {
  return stations
    .map(s => ({ ...s, distanciaKm: getDistanceKm(coords.lat, coords.lng, s.lat, s.lng) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, limit)
}
```

---

## SKILL: Web Push Notifications

### Setup VAPID

```bash
# Generar claves VAPID (ejecutar una vez)
npx web-push generate-vapid-keys
# Copiar las claves a .env.local
```

### Suscripción en el cliente

```typescript
// src/hooks/usePushNotifications.ts
export function usePushNotifications() {
  const subscribe = async (tripCode?: string) => {
    const registration = await navigator.serviceWorker.ready
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })

    // Guardar en Supabase via API
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, tripCode }),
    })
  }
  
  return { subscribe }
}
```

### Envío de notificaciones (backend)

```typescript
// src/app/api/push/notify/route.ts
import webpush from 'web-push'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_MAILTO}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: Request) {
  const { tripCode, message } = await req.json()
  
  // Obtener suscriptores del viaje desde Supabase
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('trip_code', tripCode)

  // Enviar notificación a cada suscriptor
  await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'TrenATiempo', body: message, icon: '/icons/icon-192.png' })
      )
    )
  )
}
```

---

## SKILL: Componentes UI Clave

### TrainCard

```typescript
// src/components/horarios/TrainCard.tsx
// Props: tren: Tren, estacionOrigen: string, onClick: () => void
// Muestra: número tren, tipo badge, hora salida, destino, estado
// Animación: slide-in desde abajo con stagger delay basado en índice
```

### StopTimeline

```typescript
// src/components/viaje/StopTimeline.tsx
// Props: paradas: Parada[], estacionActualId?: string (posición del convoy)
// Muestra: línea vertical con círculos por parada
// Especial: resalta la parada donde está el tren actualmente (animación pulse)
// Si la estación de consulta no es el origen → mostrar paradas anteriores en gris
```

### StationSearch

```typescript
// src/components/estacion/StationSearch.tsx
// Props: onSelect: (estacion: Estacion) => void
// Features:
//   - Debounce de 300ms en el input
//   - Botón GPS con estado loading/error
//   - Dropdown con resultados (máx 8)
//   - Teclado accesible (arrow keys, enter, escape)
//   - Destacar texto coincidente en resultados
```

---

## SKILL: Panel Admin

### Gestión de Usuarios

```typescript
// src/app/admin/usuarios/page.tsx
// Tabla con:
//   - Avatar, nombre, email
//   - Rol (badge color: verde=admin, gris=user)
//   - Fecha registro
//   - Acciones: cambiar rol, desactivar
// Usar Supabase Admin API (service_role) para operaciones de admin
// Paginación: 25 usuarios por página
// Búsqueda por nombre/email con debounce

// IMPORTANTE: Nunca usar service_role key en el cliente
// Todas las operaciones admin van por /api/admin/* (Route Handlers)
// El Route Handler verifica rol admin antes de ejecutar
```

---

## SKILL: Performance Mobile

### Prioridades
1. **Core Web Vitals**: LCP < 2.5s, CLS < 0.1, FID < 100ms.
2. **Lazy loading**: imágenes y componentes no críticos con `next/dynamic`.
3. **Prefetch**: al hacer hover en una estación, prefetch sus horarios.
4. **Optimistic UI**: al marcar favorito, actualizar UI antes de confirmación del servidor.
5. **Virtual list**: si hay >50 trenes, usar `react-virtual` para el scroll.

### Bundle size
- Analizar con `pnpm build && pnpm analyze`
- Código de admin solo se carga en rutas `/admin/*`
- Supabase client lazy-loaded en rutas que lo requieren

---

## SKILL: Testing

### Unit Tests (Vitest)

```typescript
// tests/unit/geo/nearest-station.test.ts
describe('findNearestStations', () => {
  it('returns stations sorted by distance', () => { ... })
  it('respects limit parameter', () => { ... })
})

// tests/unit/adif/parser.test.ts
describe('parseAdifResponse', () => {
  it('normalizes cercanias response correctly', () => { ... })
  it('handles missing arrival time gracefully', () => { ... })
})
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/horarios.spec.ts
test('user can search for a station and see trains', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('Buscar estación...').fill('Atocha')
  await page.getByText('Madrid Atocha Cercanías').click()
  await expect(page.getByTestId('train-list')).toBeVisible()
})

test('admin can access /admin but regular user cannot', async ({ page }) => {
  // Login como user normal
  await loginAs(page, 'user@test.com')
  await page.goto('/admin')
  await expect(page).toHaveURL('/')  // redirigido
})
```

---

## SKILL: Despliegue

### Vercel Configuration (`vercel.json`)

```json
{
  "framework": "nextjs",
  "regions": ["mad1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase_anon_key"
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

### Supabase Producción
1. Crear proyecto en `app.supabase.com`.
2. Ejecutar migrations: `supabase db push`.
3. Configurar Google OAuth en Authentication > Providers.
4. Habilitar RLS en todas las tablas.
5. Configurar redirect URLs para OAuth: `https://trenatiempo.app/auth/callback`.

---

*Versión 0.1.0 — Actualizar este fichero cuando se añadan nuevos patrones al proyecto.*

---

## SKILL: Internacionalización (next-intl)

### Regla de oro
**Ningún texto visible al usuario puede estar hardcodeado en JSX.** Siempre `t('clave')`. Claude Code debe rechazar cualquier string literal en componentes que no sea una clave de traducción.

### Orden de prioridad del locale (middleware)
```
1. Cookie NEXT_LOCALE          → preferencia guardada explícitamente por el usuario
2. profiles.preferred_locale   → si está autenticado, leer de Supabase al hacer login
3. Accept-Language header      → idioma del navegador
4. 'es'                        → fallback
```

### Añadir una nueva clave de traducción
1. Añadir la clave en `messages/es.json` (idioma base).
2. Añadir la misma clave en `messages/ca.json`, `messages/gl.json`, `messages/eu.json`.
3. Si falta la traducción en algún idioma → next-intl usa el fallback `es` automáticamente.
4. Nunca borrar claves sin borrarlas en los 4 ficheros simultáneamente.

### Selector de idioma (LocaleSwitcher)

```typescript
// src/components/layout/LocaleSwitcher.tsx
'use client'
import { useLocale as useNextIntlLocale } from 'next-intl'
import { useLocale } from '@/hooks/useLocale'

const LOCALES = [
  { code: 'es', label: 'Castellano', flag: '🇪🇸' },
  { code: 'ca', label: 'Català',     flag: '🏴' },
  { code: 'gl', label: 'Galego',     flag: '🏴' },
  { code: 'eu', label: 'Euskera',    flag: '🏴' },
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
] as const

export function LocaleSwitcher() {
  const currentLocale = useNextIntlLocale()
  const { changeLocale } = useLocale()

  return (
    <div role="radiogroup" aria-label="Idioma">
      {LOCALES.map(({ code, label, flag }) => (
        <button
          key={code}
          role="radio"
          aria-checked={currentLocale === code}
          onClick={() => changeLocale(code)}
        >
          {flag} {label}
        </button>
      ))}
    </div>
  )
}
```

### Sincronizar locale al hacer login
Cuando el usuario inicia sesión, leer `preferred_locale` de Supabase y aplicarlo:

```typescript
// src/lib/supabase/auth-helpers.ts
export async function syncLocaleOnLogin(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('preferred_locale')
    .eq('id', userId)
    .single()

  if (data?.preferred_locale) {
    // Actualizar cookie para que el middleware lo recoja en la siguiente request
    document.cookie = `NEXT_LOCALE=${data.preferred_locale}; path=/; max-age=31536000`
  }
}
```

### Fechas y horas localizadas
Usar la API nativa `Intl` con el locale activo — no añadir librerías extra:

```typescript
// Hora de salida del tren
const hora = new Intl.DateTimeFormat(locale, {
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(salidaTimestamp * 1000))

// "hace X minutos" (retraso)
const relativo = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
relativo.format(-5, 'minute') // → "hace 5 minutos" / "fa 5 minuts" / "hai 5 minutos"
```

### Testing de i18n
```typescript
// tests/unit/i18n/completeness.test.ts
// Verificar que todos los idiomas tienen las mismas claves que es.json
import es from '../../../messages/es.json'
import ca from '../../../messages/ca.json'
import gl from '../../../messages/gl.json'
import eu from '../../../messages/eu.json'

function getKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? getKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  )
}

describe('i18n completeness', () => {
  const baseKeys = getKeys(es)
  for (const [name, messages] of [['ca', ca], ['gl', gl], ['eu', eu]]) {
    it(`${name}.json has all keys from es.json`, () => {
      const keys = getKeys(messages as object)
      expect(keys).toEqual(expect.arrayContaining(baseKeys))
    })
  }
})
```
