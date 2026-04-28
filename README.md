# 🚆 TrenATiempo

> Horarios de Cercanías y Media Distancia de ADIF — en tu bolsillo.

[![CI](https://github.com/tu-org/trenatiempo/actions/workflows/ci.yml/badge.svg)](https://github.com/tu-org/trenatiempo/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com)

## ¿Qué es TrenATiempo?

TrenATiempo es una webapp **mobile-first** que muestra en tiempo real los horarios de trenes de Cercanías y Media Distancia de ADIF. Detecta automáticamente tu estación más cercana usando el GPS del dispositivo y te permite seguir el estado de tus viajes habituales.

## Características — v1.0

- [x] 🗺️ **Detección automática** de la estación más cercana vía GPS
- [x] 🚂 **Horarios en tiempo real** de Cercanías y Media Distancia (Renfe Open Data)
- [x] 📍 **Detalle de viaje** con paradas y posición actual del convoy
- [x] 🌍 **Multiidioma** — ES, CA, GL, EU, EN, FR
- [x] 🔐 **Autenticación** — email + Google OAuth
- [x] 🛡️ **Panel de administración** con gestión de usuarios y métricas
- [x] 🔔 **Notificaciones push** del estado del servicio (Web Push / VAPID)
- [x] 📱 **PWA** — instalable en Android y iOS, funciona offline
- [ ] ⭐ **Favoritos** — próximamente
- [ ] 👥 **Reportes colaborativos** — próximamente

## Stack

| | Tecnología |
|---|---|
| Frontend | Next.js 15 + React 19 |
| Lenguaje | TypeScript (strict) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email + Google) |
| Estilos | Tailwind CSS v4 |
| i18n | next-intl (6 idiomas) |
| PWA | @ducanh2912/next-pwa + Workbox |
| Push | web-push (VAPID) |
| Hosting | Vercel (región: mad1) |

## Inicio Rápido

### Requisitos
- Node.js 20+
- pnpm 9+
- Cuenta en [Supabase](https://supabase.com)

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/tu-org/trenatiempo.git
cd trenatiempo

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp env.example .env.local
# Editar .env.local con tus credenciales

# Iniciar servidor de desarrollo
pnpm dev
```

La aplicación estará disponible en [http://localhost:3000/es](http://localhost:3000/es).

El panel de administración está en [http://localhost:3000/admin](http://localhost:3000/admin).

### Crear primer admin

```sql
-- En Supabase Dashboard → SQL Editor
UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
```

## Despliegue en Vercel

### 1. Variables de entorno

Configura en Vercel → Settings → Environment Variables:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (solo backend) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clave pública VAPID |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID |
| `VAPID_MAILTO` | Email de contacto VAPID |
| `CRON_SECRET` | Secreto para cron jobs |

### 2. Google OAuth en Supabase

1. Supabase Dashboard → Authentication → Providers → Google
2. Añadir Client ID y Secret de Google Cloud Console
3. Añadir redirect URL: `https://tu-dominio.vercel.app/auth/callback`

### 3. Generar claves VAPID

```bash
npx web-push generate-vapid-keys
```

### 4. Aplicar migration de base de datos

1. Supabase Dashboard → SQL Editor
2. Pegar y ejecutar `supabase/migrations/001_initial_schema.sql`

### 5. Primer deploy

```bash
vercel deploy --prod
```

Verifica que el Service Worker se registre en DevTools → Application → Service Workers.

## Documentación

- **[CLAUDE.md](./CLAUDE.md)** — Arquitectura completa, base de datos, convenciones
- **[SKILLS.md](./SKILLS.md)** — Guías de implementación para cada área
- **[env.example](./env.example)** — Variables de entorno necesarias

## Scripts

```bash
pnpm dev          # Servidor de desarrollo
pnpm build        # Build de producción
pnpm start        # Servidor de producción
pnpm test         # Tests unitarios (Vitest)
pnpm test:e2e     # Tests E2E (Playwright)
pnpm typecheck    # TypeScript check
```

## Contribuir

1. Fork el repositorio
2. Crea una branch: `git checkout -b feature/mi-feature`
3. Commit: `git commit -m 'feat: añadir mi feature'`
4. Push: `git push origin feature/mi-feature`
5. Abre un Pull Request contra `develop`

## Licencia

MIT — Ver [LICENSE](./LICENSE) para más detalles.
