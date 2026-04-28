# 🚆 TrenATiempo

> Horarios de Cercanías y Media Distancia de ADIF — en tu bolsillo.

[![CI](https://github.com/tu-org/trenatiempo/actions/workflows/ci.yml/badge.svg)](https://github.com/tu-org/trenatiempo/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com)

## ¿Qué es TrenATiempo?

TrenATiempo es una webapp **mobile-first** que muestra en tiempo real los horarios de trenes de Cercanías y Media Distancia de ADIF. Detecta automáticamente tu estación más cercana usando el GPS del dispositivo y te permite seguir el estado de tus viajes habituales.

## Características

- 🗺️ **Detección automática** de la estación más cercana vía GPS
- 🚂 **Horarios en tiempo real** de Cercanías y Media Distancia
- 📍 **Detalle de viaje** con paradas y posición actual del convoy
- 🔔 **Notificaciones push** del estado del servicio (requiere cuenta)
- ⭐ **Favoritos** de estaciones y viajes (requiere cuenta)
- 👥 **Reportes colaborativos** — comunidad informa del estado real
- 🛡️ **Panel de administración** en `/admin`
- 📱 **PWA** — instalable en cualquier dispositivo

## Stack

| | Tecnología |
|---|---|
| Frontend | Next.js 15 + React 19 |
| Lenguaje | TypeScript (strict) |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + Google) |
| Estilos | Tailwind CSS v4 |
| Hosting | Vercel |

## Inicio Rápido

### Requisitos
- Node.js 20+
- pnpm 9+
- Docker (para Supabase local)
- Cuenta en [Supabase](https://supabase.com)

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/tu-org/trenatiempo.git
cd trenatiempo

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# Iniciar Supabase local
supabase start

# Aplicar migraciones
supabase db reset

# Generar tipos de Supabase
supabase gen types typescript --local > src/types/database.ts

# Iniciar servidor de desarrollo
pnpm dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

El panel de administración está en [http://localhost:3000/admin](http://localhost:3000/admin).

### Crear primer admin

```sql
-- En Supabase Studio o psql
UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
```

## Documentación

- **[CLAUDE.md](./CLAUDE.md)** — Arquitectura completa, base de datos, convenciones
- **[SKILLS.md](./SKILLS.md)** — Guías de implementación para cada área
- **[.env.example](./.env.example)** — Variables de entorno necesarias

## Scripts

```bash
pnpm dev          # Servidor de desarrollo
pnpm build        # Build de producción
pnpm start        # Servidor de producción
pnpm test         # Tests unitarios (Vitest)
pnpm test:e2e     # Tests E2E (Playwright)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
pnpm analyze      # Analizar bundle size
```

## Roadmap

- [x] Arquitectura base
- [ ] Integración API ADIF/Renfe
- [ ] Detección GPS + estación cercana
- [ ] Horarios Cercanías
- [ ] Horarios Media Distancia
- [ ] Detalle de viaje con paradas
- [ ] Autenticación (email + Google)
- [ ] Panel de administración
- [ ] Favoritos de estaciones y viajes
- [ ] Notificaciones push
- [ ] Reportes colaborativos
- [ ] PWA offline

## Contribuir

1. Fork el repositorio
2. Crea una branch: `git checkout -b feature/mi-feature`
3. Commit: `git commit -m 'feat: añadir mi feature'`
4. Push: `git push origin feature/mi-feature`
5. Abre un Pull Request contra `develop`

## Licencia

MIT — Ver [LICENSE](./LICENSE) para más detalles.
