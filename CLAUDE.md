# CLAUDE.md — TrenATiempo 🚆

> Guía de referencia para Claude Code. Lee este fichero antes de tocar cualquier fichero del proyecto.

---

## 1. Visión del Proyecto

**TrenATiempo** es una webapp mobile-first que muestra horarios en tiempo real de trenes de Cercanías y Media Distancia de ADIF. Permite a los usuarios consultar trenes desde su estación más cercana (vía GPS), seguir el estado de un viaje y, si se registran, guardar favoritos y suscribirse a notificaciones push.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Razón |
|---|---|---|
| Frontend | **Next.js 15** (App Router) + React 19 | SSR/SSG, RSC, rendimiento móvil |
| Lenguaje | **TypeScript** (strict mode) | Tipado fuerte en todo el proyecto |
| Estilos | **Tailwind CSS v4** + CSS Variables | Utility-first, mobile-first |
| Componentes UI | **shadcn/ui** + **Radix UI** | Accesibilidad, headless |
| Iconos | **Lucide React** | Consistente, tree-shakeable |
| Animaciones | **Motion (Framer Motion)** | Micro-interacciones fluidas |
| Backend / API | **Next.js Route Handlers** (API Routes) | Monorepo simplificado |
| Base de Datos | **Supabase** (PostgreSQL) | Auth, Realtime, RLS, Storage |
| Auth | **Supabase Auth** (email/pass + Google OAuth) | Incluido en Supabase |
| Notificaciones Push | **Web Push API** + **VAPID** | PWA nativa |
| PWA | **next-pwa** | Service Worker, offline, installable |
| i18n | **next-intl** | Internacionalización con App Router, mensajes tipados |
| Testing | **Vitest** + **Playwright** | Unit + E2E |
| CI/CD | **GitHub Actions** | Deploy en Vercel |
| Hosting | **Vercel** | Edge network, ideal para Next.js |
| Repositorio | **GitHub** | Control de versiones |

---

## 3. Estructura de Directorios

```
trenatiempo/
├── CLAUDE.md                    # ← este fichero
├── SKILLS.md                    # Guías de desarrollo específicas
├── .env.local                   # Variables de entorno (NO subir a git)
├── .env.example                 # Plantilla de variables de entorno
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
│
├── messages/                    # Ficheros de traducción (next-intl)
│   ├── es.json                  # Castellano (idioma base/fallback)
│   ├── ca.json                  # Català
│   ├── gl.json                  # Galego
│   └── eu.json                  # Euskera
│
├── public/
│   ├── icons/                   # PWA icons (512x512, 192x192, etc.)
│   ├── images/                  # Imágenes estáticas
│   └── manifest.json            # PWA manifest
│
├── src/
│   ├── i18n/
│   │   ├── routing.ts           # Definición de locales y locale por defecto
│   │   ├── navigation.ts        # Link, redirect, useRouter con locale
│   │   └── request.ts           # Carga de mensajes por request (next-intl)
│   │
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout mínimo (sin locale)
│   │   │
│   │   └── [locale]/            # ← TODAS las rutas bajo prefijo de locale
│   │       ├── layout.tsx       # Layout con NextIntlClientProvider + fonts
│   │       ├── page.tsx         # Home — búsqueda de estación
│   │       ├── globals.css      # CSS global + design tokens
│   │       │
│   │       ├── (public)/
│   │       │   ├── estacion/
│   │       │   │   └── [codigo]/page.tsx
│   │       │   └── viaje/
│   │       │       └── [id]/page.tsx
│   │       │
│   │       ├── (auth)/
│   │       │   ├── login/page.tsx
│   │       │   └── registro/page.tsx
│   │       │
│   │       ├── (app)/
│   │       │   ├── favoritos/page.tsx
│   │       │   └── perfil/page.tsx   # Aquí se guarda el idioma preferido
│   │       │
│   │       └── admin/
│   │           ├── layout.tsx
│   │           ├── page.tsx
│   │           └── usuarios/page.tsx
│   │
│   │   └── api/                 # Route Handlers — fuera del [locale], sin i18n
│   │       ├── renfe/
│   │       │   ├── estaciones/route.ts
│   │       │   ├── horarios/route.ts
│   │       │   └── viaje/[id]/route.ts
│   │       ├── push/
│   │       │   ├── subscribe/route.ts
│   │       │   └── notify/route.ts
│   │       └── admin/
│   │           └── usuarios/route.ts
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui base components
│   │   ├── layout/              # Header, Footer, BottomNav, LocaleSwitcher
│   │   ├── estacion/            # StationSearch, StationCard
│   │   ├── horarios/            # TrainList, TrainCard, FilterBar
│   │   ├── viaje/               # TripDetail, StopTimeline
│   │   ├── auth/                # LoginForm, RegisterForm, GoogleButton
│   │   ├── admin/               # UserTable, UserEditModal
│   │   └── pwa/                 # InstallPrompt, PushPermission
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   ├── renfe/
│   │   │   ├── gtfs-rt.ts       # Consumo GTFS-RT tiempo real
│   │   │   ├── gtfs-static.ts   # Consultas sobre datos GTFS en Supabase
│   │   │   └── types.ts
│   │   ├── geo/
│   │   │   └── nearest-station.ts
│   │   ├── push/
│   │   │   └── web-push.ts
│   │   └── utils.ts
│   │
│   ├── hooks/
│   │   ├── useGeolocation.ts
│   │   ├── useNearestStation.ts
│   │   ├── useHorarios.ts
│   │   ├── useLocale.ts         # Leer/guardar idioma preferido del usuario
│   │   └── usePushNotifications.ts
│   │
│   ├── store/
│   │   ├── userStore.ts
│   │   └── favoritesStore.ts
│   │
│   ├── types/
│   │   ├── renfe.ts
│   │   ├── database.ts
│   │   └── index.ts
│   │
│   └── middleware.ts            # Auth guards + detección/redirección de locale
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
└── tests/
    ├── unit/
    └── e2e/
```

---

## 4. Base de Datos (Supabase / PostgreSQL)

### Tablas Principales

```sql
-- Perfiles de usuario (extiende auth.users de Supabase)
profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
)

-- Estaciones (cacheadas desde ADIF)
stations (
  id          text PRIMARY KEY,  -- código ADIF
  name        text NOT NULL,
  short_name  text,
  lat         float8,
  lng         float8,
  province    text,
  types       text[],            -- ['cercanias', 'md', 'ave', ...]
  active      boolean DEFAULT true
)

-- Favoritos de estaciones (funcionalidad futura)
favorite_stations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  station_id  text REFERENCES stations(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, station_id)
)

-- Favoritos de viajes (funcionalidad futura)
favorite_trips (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  trip_code   text NOT NULL,     -- código de tren ADIF
  origin_id   text REFERENCES stations(id),
  dest_id     text REFERENCES stations(id),
  created_at  timestamptz DEFAULT now()
)

-- Suscripciones push (funcionalidad futura)
push_subscriptions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  trip_code   text,              -- NULL = todas las alertas
  created_at  timestamptz DEFAULT now()
)

-- Reportes de estado en tiempo real (funcionalidad futura)
trip_reports (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id),
  trip_code   text NOT NULL,
  date        date NOT NULL,
  on_time     boolean,
  train_short boolean,           -- convoy corto
  delay_mins  integer,
  notes       text,
  created_at  timestamptz DEFAULT now()
)
```

### Row Level Security (RLS)
- `profiles`: cada usuario solo puede leer/editar su propio perfil. Admins pueden leer todos.
- `favorite_stations` / `favorite_trips`: solo el propio usuario.
- `push_subscriptions`: solo el propio usuario.
- `trip_reports`: lectura pública (anonimizada), escritura solo autenticados.
- `stations`: lectura pública, escritura solo admins.

---

## 5. Integración con Renfe Open Data (API oficial)

Renfe publica datos abiertos oficiales en **[data.renfe.com](https://data.renfe.com)** bajo licencia **Creative Commons Attribution 4.0**. Son los datos reales que alimentan la app oficial de ADIF. **No requieren autenticación ni API key.**

### Fuentes de datos oficiales

#### 🟢 Tiempo Real (GTFS-RT) — sin autenticación

| Dataset | URL | Actualización |
|---|---|---|
| **Horarios de viaje — Cercanías** (cancelaciones, retrasos) | `https://gtfsrt.renfe.com/trip_updates.json` | cada **20s** |
| **Horarios de viaje — AV/LD/MD** | obtener URL exacta de [data.renfe.com](https://data.renfe.com/dataset/horarios-viaje-alta-velocidad-larga-media-distancia) | cada **30s** |
| **Posición vehículos — Cercanías** (GPS + andén) | `https://gtfsrt.renfe.com/vehicle_positions.json` | cada **20s** |
| **Posición vehículos — AV/LD/MD** | obtener URL exacta de [data.renfe.com](https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md) | cada ~15 min |
| **Incidencias y avisos — Cercanías** | obtener URL de [data.renfe.com](https://data.renfe.com/dataset/incidencias-avisos) | cada **20s** |
| **Avisos modificaciones planificadas** | obtener URL de [data.renfe.com](https://data.renfe.com/dataset/avisos) | periódico |

> También disponibles en formato binario Protocol Buffers (`.pb`) para mayor eficiencia.

#### 🔵 Horarios estáticos (GTFS) — base de datos de horarios

| Dataset | URL | Descripción |
|---|---|---|
| **Horarios Cercanías y Rodalies** | `https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` | GTFS completo de Cercanías |
| **Horarios AV/LD/MD** | obtener URL de [data.renfe.com](https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia) | GTFS completo AV/LD/MD |
| **Estaciones — listado completo** | [data.renfe.com/dataset/estaciones-listado-completo](https://data.renfe.com/dataset/estaciones-listado-completo) | CSV/XLSX con todas las estaciones |

### Estructura datos GTFS-RT (trip_updates.json)

```json
{
  "header": { "gtfsRealtimeVersion": "2.0", "timestamp": 1714300000 },
  "entity": [
    {
      "id": "C1-23537",
      "tripUpdate": {
        "trip": { "tripId": "C1-23537", "routeId": "C1", "directionId": 0 },
        "stopTimeUpdate": [
          {
            "stopSequence": 3,
            "stopId": "60000",
            "arrival":   { "delay": 120, "time": 1714300200 },
            "departure": { "delay": 120, "time": 1714300260 }
          }
        ],
        "vehicle": { "label": "C1-23537-PLATF.(3)" }
      }
    }
  ]
}
```

### Estructura GTFS-RT (vehicle_positions.json)

```json
{
  "entity": [
    {
      "id": "C1-23537",
      "vehicle": {
        "trip": { "tripId": "C1-23537", "routeId": "C1" },
        "position": { "latitude": 40.4168, "longitude": -3.7038, "speed": 0 },
        "currentStatus": "STOPPED_AT",
        "stopId": "60000",
        "label": "C1-23537-PLATF.(3)",
        "timestamp": 1714300050
      }
    }
  ]
}
```

### Estrategia de integración

```
GTFS estático (horarios base)              GTFS-RT (actualizaciones tiempo real)
         ↓                                               ↓
  Importar en Supabase                  Consumir en Route Handlers
  (cron diario/semanal)                 con caché en Supabase (TTL = frecuencia)
         ↓                                               ↓
               Combinar: horario base + desvíos en tiempo real
                                 ↓
                       Respuesta normalizada al cliente
```

### Tipos normalizados (desde GTFS/GTFS-RT)

```typescript
// src/lib/renfe/types.ts
export interface Tren {
  id: string              // tripId GTFS (ej: "C1-23537")
  routeId: string         // ej: "C1", "R598"
  tipo: 'cercanias' | 'md' | 'ave' | 'regional' | 'ld'
  paradas: Parada[]
  estado: 'a_tiempo' | 'retrasado' | 'cancelado' | 'desconocido'
  retrasoSegundos?: number
  posicionActual?: {      // De vehicle_positions GTFS-RT
    lat: number
    lng: number
    stopId?: string
    anden?: string        // Del campo "label", ej: "PLATF.(3)"
    enMovimiento: boolean
  }
}

export interface Parada {
  stopId: string          // stop_id GTFS
  nombre: string
  llegadaProgramada?: number   // Unix timestamp
  llegadaReal?: number         // Con delay aplicado
  salidaProgramada?: number
  salidaReal?: number
  delaySeg?: number
  esOrigen: boolean
  esDestino: boolean
}
```

### Manejo de errores
- Si Renfe GTFS-RT falla → retornar caché aunque esté expirada + `stale: true`.
- Loggear errores en Supabase tabla `api_errors` para monitoring.
- En UI mostrar badge "Actualizado hace Xs" actualizado en tiempo real.

### Endpoints internos a implementar

| Endpoint | Descripción | Fuente |
|---|---|---|
| `GET /api/renfe/estaciones?q=madrid` | Búsqueda por nombre | GTFS stops.txt (en Supabase) |
| `GET /api/renfe/estaciones/cercanas?lat=&lng=` | Estaciones más cercanas | GTFS stops.txt (en Supabase) |
| `GET /api/renfe/horarios?stopId=&tipo=cercanias\|md` | Próximas salidas | GTFS + GTFS-RT combinados |
| `GET /api/renfe/viaje/[tripId]` | Detalle viaje con paradas y posición | GTFS-RT trip_updates + vehicle_positions |

---

## 6. Internacionalización (i18n)

### Idiomas soportados

| Código | Idioma | Locale |
|---|---|---|
| `es` | Castellano | `es-ES` — **idioma base y fallback** |
| `ca` | Català | `ca-ES` |
| `gl` | Galego | `gl-ES` |
| `eu` | Euskera | `eu-ES` |
| `en` | English | `en-GB` |
| `fr` | Français | `fr-FR` |

### Librería: next-intl

`next-intl` es la solución estándar para i18n con Next.js App Router. Ofrece enrutamiento por locale (`/es/`, `/ca/`, etc.), mensajes tipados y compatibilidad con RSC.

```bash
pnpm add next-intl
```

### Configuración de rutas

```typescript
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['es', 'ca', 'gl', 'eu', 'en', 'fr'],
  defaultLocale: 'es',
  // URL /es → /  (castellano sin prefijo) o con prefijo, a decisión del equipo
  // Recomendado: siempre con prefijo para claridad y SEO
})
```

### Estructura de mensajes

Cada fichero JSON en `/messages/` tiene la misma estructura de claves:

```json
// messages/es.json (castellano — base)
{
  "common": {
    "appName": "ElAndén",
    "loading": "Cargando...",
    "error": "Ha ocurrido un error",
    "retry": "Reintentar",
    "close": "Cerrar"
  },
  "nav": {
    "home": "Inicio",
    "favorites": "Favoritos",
    "alerts": "Alertas",
    "profile": "Perfil"
  },
  "home": {
    "searchPlaceholder": "Buscar estación...",
    "useGPS": "Usar mi ubicación",
    "nearestStation": "Estación más cercana",
    "gpsError": "No se pudo obtener tu ubicación"
  },
  "horarios": {
    "title": "Próximas salidas",
    "filterAll": "Todos",
    "filterCercanias": "Cercanías",
    "filterMD": "Media Distancia",
    "onTime": "A tiempo",
    "delayed": "Retrasado {minutes} min",
    "cancelled": "Cancelado",
    "noTrains": "No hay trenes próximos"
  },
  "viaje": {
    "stops": "Paradas",
    "currentPosition": "Posición actual del convoy",
    "platform": "Andén {number}",
    "subscribe": "Suscribirme a este tren"
  },
  "auth": {
    "login": "Iniciar sesión",
    "register": "Registrarse",
    "loginWithGoogle": "Continuar con Google",
    "email": "Correo electrónico",
    "password": "Contraseña",
    "logout": "Cerrar sesión"
  },
  "profile": {
    "language": "Idioma",
    "saveLanguage": "Guardar preferencia"
  },
  "admin": {
    "users": "Usuarios",
    "role": "Rol",
    "status": "Estado",
    "actions": "Acciones"
  }
}
```

```json
// messages/ca.json (català)
{
  "common": {
    "appName": "ElAndén",
    "loading": "Carregant...",
    "error": "S'ha produït un error",
    "retry": "Torna-ho a intentar",
    "close": "Tanca"
  },
  "nav": {
    "home": "Inici",
    "favorites": "Preferits",
    "alerts": "Alertes",
    "profile": "Perfil"
  },
  "home": {
    "searchPlaceholder": "Cerca estació...",
    "useGPS": "Usar la meva ubicació",
    "nearestStation": "Estació més propera",
    "gpsError": "No s'ha pogut obtenir la teva ubicació"
  },
  "horarios": {
    "title": "Properes sortides",
    "filterAll": "Tots",
    "filterCercanias": "Rodalies",
    "filterMD": "Mitjana Distància",
    "onTime": "A temps",
    "delayed": "Retardat {minutes} min",
    "cancelled": "Cancel·lat",
    "noTrains": "No hi ha trens pròxims"
  }
}
```

> Los ficheros `gl.json` (Galego) y `eu.json` (Euskera) siguen la misma estructura. Usar un servicio de traducción profesional para garantizar la calidad — evitar traducción automática para idiomas co-oficiales.

### Uso en componentes

```typescript
// En Server Components (RSC)
import { getTranslations } from 'next-intl/server'

export default async function HorariosPage() {
  const t = await getTranslations('horarios')
  return <h1>{t('title')}</h1>
}

// En Client Components
'use client'
import { useTranslations } from 'next-intl'

export function FilterBar() {
  const t = useTranslations('horarios')
  return (
    <div>
      <button>{t('filterAll')}</button>
      <button>{t('filterCercanias')}</button>
      <button>{t('filterMD')}</button>
    </div>
  )
}

// Interpolación con variables
t('delayed', { minutes: 5 }) // → "Retrasado 5 min"
```

### Guardar idioma preferido del usuario

El idioma preferido se guarda en **dos sitios** para cubrir todos los casos:

1. **Supabase** (`profiles.preferred_locale`): para usuarios registrados, persiste entre dispositivos.
2. **Cookie** (`NEXT_LOCALE`): para usuarios anónimos y como fuente de verdad para el middleware.

```typescript
// src/hooks/useLocale.ts
export function useLocale() {
  const router = useRouter()
  const pathname = usePathname()

  const changeLocale = async (newLocale: Locale) => {
    // 1. Actualizar cookie (next-intl la lee automáticamente)
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`

    // 2. Si usuario autenticado → guardar en Supabase
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ preferred_locale: newLocale })
        .eq('id', user.id)
    }

    // 3. Navegar a la misma ruta con el nuevo locale
    router.replace(pathname, { locale: newLocale })
  }

  return { changeLocale }
}
```

### Middleware: detección automática de locale

```typescript
// src/middleware.ts — combina next-intl + auth guards
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  // 1. Prioridad de locale:
  //    a) Cookie NEXT_LOCALE (preferencia guardada)
  //    b) Accept-Language header del navegador
  //    c) Locale por defecto: 'es'
  const intlResponse = intlMiddleware(request)

  // 2. Auth guards sobre la respuesta de intl
  // ... (ver sección de Auth)

  return intlResponse
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
```

### Campo en Supabase profiles

```sql
-- Añadir en migration (o nueva migration 002)
ALTER TABLE public.profiles
  ADD COLUMN preferred_locale text
    DEFAULT 'es'
    CHECK (preferred_locale IN ('es', 'ca', 'gl', 'eu', 'en', 'fr'));
```

### Consideraciones SEO

- Cada idioma tiene su propia URL: `/es/`, `/ca/`, `/gl/`, `/eu/`.
- Añadir `hreflang` en el `<head>` para indicar a Google las versiones equivalentes.
- `next-intl` genera automáticamente los metadatos si se usa `generateMetadata`.

---

## 7. Autenticación y Autorización

### Flujos
1. **Registro**: email/contraseña → confirmación email → perfil creado vía trigger Supabase.
2. **Login email**: Supabase Auth, JWT en cookie HttpOnly.
3. **Login Google**: OAuth2 via Supabase → redirect a `/auth/callback`.
4. **Admin**: rol `admin` en tabla `profiles`. El middleware de Next.js verifica el rol antes de dar acceso a `/admin/*`.

### Middleware (`src/middleware.ts`)
```typescript
// Proteger rutas /admin/* → solo rol 'admin'
// Proteger rutas /(app)/* → solo autenticados
// Redirigir a /login si no hay sesión
```

---

## 8. PWA & Push Notifications

- `manifest.json` con iconos, theme-color, display: standalone.
- Service Worker via `next-pwa` para caché offline de estaciones y últimos horarios consultados.
- Web Push (VAPID): al suscribirse a un viaje, se guarda el `PushSubscription` en Supabase. El backend envía notificaciones via `web-push` npm package.

---

## 9. Diseño & UI

### Identidad Visual
- **Paleta**: Azul ferroviario profundo `#0A1628` · Acento amarillo-ámbar `#F5A623` · Blanco roto `#F8F6F2` · Verde destino `#22C55E`.
- **Tipografía**: `Syne` (display, bold) + `DM Sans` (body).
- **Aesthetic**: "Estación nocturna moderna" — oscuro, con destellos ámbar, líneas limpias, sensación de movimiento.
- **Mobile-first**: bottom navigation, cards swipeables, gestos naturales.
- **NO** parecerse a Transporta'm (azul flat genérico) ni Ferroviaria (rojo clásico RENFE).

### Componentes clave
- `TrainCard`: card horizontal con número de tren, destino, hora salida/llegada, estado (a tiempo/retrasado), badge Cercanías/MD.
- `StopTimeline`: línea vertical de paradas con círculos, hora, nombre estación. Resalta la estación actual del convoy.
- `StationSearch`: input con autocompletado + botón GPS.
- `BottomNav`: 4 tabs — Inicio, Favoritos, Alertas, Perfil.
- `LocaleSwitcher`: selector de idioma en la pantalla de Perfil y en onboarding.

---

## 10. Panel de Administración (`/admin`)

Acceso exclusivo a usuarios con `role = 'admin'`. El panel de admin no está traducido — se sirve siempre en castellano.

### Funcionalidades v1
- **Dashboard**: métricas básicas (usuarios registrados, estaciones en caché, estado API Renfe).
- **Gestión de Usuarios** (`/admin/usuarios`):
  - Tabla paginada con búsqueda.
  - Cambiar rol (user ↔ admin).
  - Desactivar/reactivar cuenta.
  - Ver fecha de registro, último acceso e idioma preferido.

---

## 11. Variables de Entorno

```bash
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Solo backend, nunca al cliente

# Google OAuth (configurado en Supabase Dashboard)
# No se necesita aquí, se configura en Supabase

# Web Push VAPID
VAPID_PUBLIC_KEY=BM...
VAPID_PRIVATE_KEY=xxx
VAPID_MAILTO=admin@[tudominio].app

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=es

# App
NEXT_PUBLIC_APP_URL=https://[tudominio].app
NODE_ENV=development
```

---

## 12. Scripts de Desarrollo

```bash
# Instalar dependencias
pnpm install

# Desarrollo local
pnpm dev

# Supabase local (requiere Docker)
supabase start
supabase db reset   # Aplica migrations + seed

# Generar tipos de Supabase
supabase gen types typescript --local > src/types/database.ts

# Tests
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright

# Build producción
pnpm build
pnpm start
```

---

## 13. Git & CI/CD

### Branches
- `main` → producción (Vercel auto-deploy)
- `develop` → staging
- `feature/*` → nuevas funcionalidades
- `fix/*` → bugfixes

### Convención de commits (Conventional Commits)
```
feat(horarios): add cercanias filter
fix(auth): google oauth redirect loop
feat(i18n): add galego translations
chore(deps): update next to 15.x
```

### GitHub Actions
- **PR**: lint + typecheck + unit tests.
- **Push a main**: build + deploy a Vercel + E2E tests.

---

## 14. Funcionalidades Futuras (Roadmap)

| Feature | Descripción | Prioridad |
|---|---|---|
| Favoritos | Guardar estaciones y viajes favoritos | Alta |
| Push Suscripciones | Suscribirse a un tren y recibir alertas de estado | Alta |
| Reportes colaborativos | Usuarios reportan si el tren va a tiempo / convoy corto | Media |
| Widget iOS/Android | Ver próximos trenes desde la pantalla de inicio | Baja |
| Modo offline | Ver últimos horarios sin conexión via Service Worker | Media |
| Mapa de líneas | Visualización geográfica del trayecto | Baja |
| Traducción valenciano | Ampliar idiomas con `va-ES` | Media |

---

## 15. Consideraciones de Seguridad

- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente.
- Rate limiting en todos los endpoints de API (`/api/*`).
- Validar y sanitizar todos los inputs (Zod en schemas).
- RLS en todas las tablas de Supabase.
- CSP headers configurados en `next.config.ts`.
- No cachear datos sensibles del usuario en Service Worker.

---

## 16. Convenciones de Código

- **Componentes**: PascalCase, un componente por fichero.
- **Hooks**: camelCase con prefijo `use`.
- **Types/Interfaces**: PascalCase con prefijo `T` para tipos, `I` para interfaces (opcional).
- **API Routes**: camelCase, siempre tipadas con Zod para request/response.
- **i18n**: todas las cadenas de texto visibles al usuario **deben** usar `t()` — prohibido texto literal en JSX.
- **CSS**: Tailwind utility classes, evitar CSS custom salvo design tokens en `globals.css`.
- **Imports**: paths absolutos desde `@/` (configurado en tsconfig).
- **Exports**: named exports en componentes, default export solo en pages.

---

*Última actualización: Abril 2026 — v0.1.0*
