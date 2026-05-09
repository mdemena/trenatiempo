# TrenATiempo

> Horarios de Cercanías y Media Distancia de ADIF — en tiempo real, en tu bolsillo.

[![CI](https://github.com/tu-org/trenatiempo/actions/workflows/ci.yml/badge.svg)](https://github.com/tu-org/trenatiempo/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com)

## ¿Qué es TrenATiempo?

TrenATiempo es una webapp **mobile-first** que muestra en tiempo real los horarios de trenes de Cercanías y Media Distancia de ADIF. Detecta automáticamente tu estación más cercana usando el GPS, te permite buscar estaciones por nombre, consultar horarios con estado actualizado (retrasos, cancelaciones, andén) y seguir la posición del convoy en cada parada.

## Características

- [x] 🗺️ **Detección automática** de la estación más cercana vía GPS
- [x] 🔍 **Buscador de estaciones** con autocompletado, resaltado de texto y navegación por teclado
- [x] 🚂 **Horarios en tiempo real** de Cercanías y Media Distancia (Renfe Open Data GTFS-RT)
- [x] 📍 **Detalle de viaje** con línea de tiempo de paradas, retrasos, cancelaciones, andén y posición GPS del convoy
- [x] 🌍 **Multiidioma** — ES, CA, GL, EU, EN, FR
- [x] 🔐 **Autenticación** — email + Google OAuth con sesión persistente
- [x] 👤 **Perfil de usuario** con selector de idioma persistente
- [x] 🛡️ **Panel de administración** con dashboard de métricas, gestión de usuarios (rol, activo), CSV export
- [x] 🔔 **Notificaciones push** por viaje (Web Push / VAPID) con suscripción/desuscripción
- [x] 📱 **PWA** — instalable en Android y iOS, caché offline de horarios
- [x] 🕒 **Auto-actualización** cada 20s (Cercanías) / 30s (Media Distancia)
- [x] 🎨 **Design system** ferroviario con colores de línea oficiales (40+ rutas)
- [ ] ⭐ **Favoritos** — próximamente
- [ ] 👥 **Reportes colaborativos** — próximamente

## Stack

| | Tecnología |
|---|---|
| Frontend | Next.js 15 + React 19 (App Router) |
| Lenguaje | TypeScript (strict) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email + Google) |
| Estilos | Tailwind CSS v4 |
| i18n | next-intl (6 idiomas: es, ca, gl, eu, en, fr) |
| PWA | @ducanh2912/next-pwa + Workbox |
| Push | web-push (VAPID) |
| Animaciones | Motion (Framer Motion) |
| Testing | Vitest + Playwright |
| Hosting | Vercel (región: mad1) |

## Inicio Rápido

### Requisitos
- Node.js 20+
- pnpm 9+
- Cuenta en [Supabase](https://supabase.com)

### Instalación

```bash
git clone https://github.com/tu-org/trenatiempo.git
cd trenatiempo
pnpm install
cp .env.example .env.local
# Editar .env.local con tus credenciales
pnpm dev
```

La app estará en [http://localhost:3000/es](http://localhost:3000/es).  
El panel de administración en [http://localhost:3000/admin](http://localhost:3000/admin).

### Crear primer admin

```sql
-- Supabase Dashboard → SQL Editor
UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
```

## Migraciones de Base de Datos

Ejecutar en Supabase Dashboard → SQL Editor en este orden:

| Migration | Descripción |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Schema inicial: profiles, stations, favorites, push_subscriptions, trip_reports, adif_cache |
| `supabase/migrations/002_gtfs_stop_times.sql` | Tabla `gtfs_stop_times` para horarios diarios importados desde GTFS |

## Scripts

### Desarrollo

```bash
pnpm dev          # Servidor de desarrollo con Turbopack
pnpm build        # Build de producción
pnpm start        # Servidor de producción
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm test         # Tests unitarios (Vitest)
pnpm test:e2e     # Tests E2E (Playwright)
pnpm analyze      # Análisis de bundle
```

### Actualización de datos

#### `pnpm seed:stations`

Importa o actualiza el catálogo de estaciones desde los feeds GTFS oficiales de Renfe. Idempotente.

```bash
pnpm seed:stations
```

**Requisitos:** `curl`, `unzip`, `python3` instalados en el sistema.

| Feed | Fuente | Tipos asignados |
|---|---|---|
| Cercanías | `ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` | `cercanias` |
| AV/LD/MD | `ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip` | `ave`, `ld`, `md`, `regional` (clasificados por nombre de ruta) |

#### `pnpm seed:horarios`

Importa los horarios del día desde el GTFS de Cercanías. Necesario ejecutar **cada día** para tener los horarios actualizados.

```bash
pnpm seed:horarios
```

**Qué hace:**
1. Descarga el GTFS de Cercanías (con caché de 6h para no repetir)
2. Filtra los servicios activos para hoy según `calendar.txt`
3. Importa `stop_times.txt` en lotes de 500 a la tabla `gtfs_stop_times`
4. Limpia filas de días anteriores

**Requisitos:** `curl`, `python3` instalados.

## Cron Jobs

TrenATiempo usa dos mecanismos complementarios:

### 1. Limpieza automática (`POST /api/cron/cleanup`)

Endpoint protegido con `CRON_SECRET` (Bearer token) que ejecuta tareas de mantenimiento:

- Elimina entradas expiradas de la caché de ADIF (`adif_cache`)
- Elimina suscripciones push inactivas de más de 30 días

**Configurar en Vercel Cron Jobs:**

```json
// vercel.json (ya incluido)
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```

Y llamarlo diariamente (medianoche UTC):

```bash
curl -X POST https://tu-dominio.vercel.app/api/cron/cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 2. Actualización diaria de horarios

Ejecutar `pnpm seed:horarios` cada día antes de las 6:00. Opciones:

**Opción A — GitHub Actions (recomendado):**

```yaml
# .github/workflows/seed-horarios.yml
name: Seed horarios
on:
  schedule:
    - cron: "0 5 * * *"   # 5:00 UTC
jobs:
  seed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm seed:horarios
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

**Opción B — Vercel Cron + script remoto:**  
Crear un endpoint que ejecute el seed bajo demanda (protegido con `CRON_SECRET`).

**Opción C — Máquina propia (crontab):**

```bash
# crontab -e
0 5 * * * cd /ruta/trenatiempo && pnpm seed:horarios >> /var/log/seed-horarios.log 2>&1
```

### 3. Actualización de estaciones

Ejecutar `pnpm seed:stations` manualmente cada vez que Renfe publique cambios en el GTFS (unas pocas veces al año).

## API Endpoints

### Públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/renfe/estaciones?q=&limit=` | Buscar estaciones por nombre |
| `GET` | `/api/renfe/horarios?stopId=&tipo=` | Próximas salidas desde una estación |
| `GET` | `/api/renfe/viaje/[id]?tipo=` | Detalle de un viaje con paradas y posición |

### Autenticados (sesión requerida)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/push/subscribe` | Suscribirse a notificaciones push de un viaje |
| `DELETE` | `/api/push/subscribe` | Desuscribirse |
| `GET` | `/api/push/subscriptions` | Listar suscripciones del usuario |

### Admin (rol admin requerido)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/stats` | Métricas del dashboard |
| `GET` | `/api/admin/usuarios?page=&search=&role=&status=` | Listar usuarios (paginado, búsqueda, filtros) |
| `PATCH` | `/api/admin/usuarios` | Actualizar rol/estado de un usuario |

### Cron (CRON_SECRET requerido)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/cron/cleanup` | Limpiar caché expirada y suscripciones inactivas |

## Variables de Entorno

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (solo backend) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clave pública VAPID |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID |
| `VAPID_MAILTO` | Email de contacto VAPID |
| `CRON_SECRET` | Secreto para proteger endpoints cron |
| `NEXT_PUBLIC_GTM_ID` | ID de Google Tag Manager |
| `NEXT_PUBLIC_APP_URL` | URL base de la aplicación |
| `ADIF_CACHE_TTL_HORARIOS` | TTL en segundos para caché de horarios (defecto: 300) |
| `ADIF_CACHE_TTL_ESTACIONES` | TTL en segundos para caché de estaciones (defecto: 86400) |
| `API_RATE_LIMIT_RPM` | Límite de requests por minuto (defecto: 60) |

## Despliegue en Vercel

1. Configurar variables de entorno en Vercel → Settings → Environment Variables
2. Configurar Google OAuth en Supabase Dashboard → Authentication → Providers → Google
   - Redirect URL: `https://tu-dominio.vercel.app/auth/callback`
3. Generar claves VAPID: `npx web-push generate-vapid-keys`
4. Aplicar migraciones SQL en Supabase Dashboard → SQL Editor
5. Desplegar: `vercel deploy --prod`
6. Configurar Vercel Cron Jobs en vercel.json (ver sección Cron)
7. Ejecutar `pnpm seed:stations` y configurar `pnpm seed:horarios` diario

## Documentación

- **[CLAUDE.md](./CLAUDE.md)** — Arquitectura completa, base de datos, convenciones
- **[SKILLS.md](./SKILLS.md)** — Guías de implementación para cada área
- **[.env.example](./.env.example)** — Variables de entorno necesarias

## Licencia

MIT — Ver [LICENSE](./LICENSE) para más detalles.
