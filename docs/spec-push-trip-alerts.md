# Spec: Alertas push por tren (retraso + llegada ~10 min)

> Fecha: 2026-09-13 · Estado: **para revisión** · Rama objetivo: `development` → PR

## Objective

Que un usuario autenticado pueda suscribirse a **un tren concreto** (la corrida de hoy) desde la card del tren o el detalle del viaje, eligiendo entre dos tipos de aviso:

1. **Retraso**: se le notifica si el tren lleva un retraso **≥ 5 min** respecto a su horario.
2. **Llegada**: se le notifica cuando el tren está a **~10 min** de llegar a la **estación donde está viendo el tren** (la de la cabecera actual, capturada automáticamente, sin UI extra).

Ambos avisos aplican solo a los **horarios de hoy** (datos reales GTFS-RT). Nada se envía en fechas futuras (no hay tiempo real).

Éxito = el usuario recibe una push por navegador/Web Push cuando ocurre cualquiera de los dos eventos, **una única vez por evento y por día**, sin spam.

## Decisiones acordadas (con el usuario)

| Tema                          | Decisión                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Estación de llegada del aviso | La estación donde el usuario está viendo el tren (cabecera actual) — auto-capturada                                             |
| Umbral de retraso             | ≥ 5 minutos (300 s) para notificar                                                                                              |
| Umbral de llegada             | ~10 minutos antes de la llegada prevista                                                                                        |
| Alcance de la suscripción     | El usuario elige el tipo (checkboxes: retraso / llegada); al menos uno obligatorio                                              |
| Anti-duplicado                | Ambas: columna `last_*_sent_at` en la suscripción (chequeo rápido) **+** tabla `push_events` con constraint UNIQUE (freno duro) |

## Tech Stack

Sin dependencias nuevas. Usa lo ya existente:

- `web-push` (VAPID) → `src/lib/push/web-push.ts`
- Supabase (`push_subscriptions`, RLS, service role en server) → `src/lib/supabase/admin.ts`
- GTFS-RT (`fetchTripUpdates`, `indexTripUpdatesById`, `resolveEstado`) → `src/lib/renfe/gtfs-rt.ts`
- GTFS estático (`gtfs_stop_times`) para la hora programada de llegada a la estación
- Crons de Vercel (`vercel.json`)
- `@serwist/next` service worker (`src/sw.ts`)
- shadcn/Radix (`Dialog`, `Checkbox` o similares ya presentes) para el diálogo de elección

## Commands

```bash
# Dev
pnpm dev

# Verificación antes de commit/PR
pnpm typecheck
pnpm lint
pnpm test            # Vitest (unit)

# Build producción
pnpm build           # next build && serwist build

# E2E (manual, fuera de CI)
pnpm test:e2e

# Aplicar migration (dashboard Supabase, ver §12b de CLAUDE.md):
#   supabase/migrations/007_push_trip_alerts.sql
```

## Project Structure (cambios)

```
supabase/migrations/007_push_trip_alerts.sql   # NUEVO: schema
src/types/database.ts                          # tipar tablas nuevas/alteradas
src/lib/push/monitor.ts                        # NUEVO: lógica pura (delay/llegada/decisión)
src/lib/push/web-push.ts                       # buildPayload: url de destino en data
src/app/api/push/subscribe/route.ts            # nuevo request schema (stationId, tipos)
src/app/api/push/subscriptions/route.ts        # devolver nuevos campos (station_id, tipos)
src/app/api/push/notify/route.ts               # queda como envío manual admin (sin cambios)
src/app/api/cron/monitor-push/route.ts         # NUEVO: cron que monitoriza GTFS-RT
src/sw.ts                                      # handlers 'push' + 'notificationclick'
src/components/pwa/PushPermission.tsx          # diálogo con checkboxes (retraso/llegada) + stationId
src/components/horarios/TrainCard.tsx          # pasar stationId=stopId; ocultar campana en fechas futuras
src/components/viaje/TripHeader.tsx            # pasar stopId a PushPermission
src/components/viaje/ViajeClient.tsx           # pasar stopId a PushPermission
src/app/[locale]/(app)/alertas/page.tsx        # mostrar estación + tipo de cada alerta
messages/{es,ca,gl,eu,en,fr}.json              # claves i18n nuevas
vercel.json                                    # añadir cron /api/cron/monitor-push
CLAUDE.md                                      # §8 PWA & Push: documentar flujo completo
```

## Base de Datos — `007_push_trip_alerts.sql`

```sql
-- ── 1. Ampliar push_subscriptions ────────────────────────────────────────────
ALTER TABLE public.push_subscriptions
  ADD COLUMN station_id          text,                                     -- estación indicada (cabecera actual)
  ADD COLUMN notify_delay        boolean NOT NULL DEFAULT false,           -- avisar si se retrasa ≥ umbral
  ADD COLUMN notify_arrival      boolean NOT NULL DEFAULT false,           -- avisar ~10 min antes de llegar
  ADD COLUMN delay_threshold_sec integer     NOT NULL DEFAULT 300,         -- 5 min
  ADD COLUMN arrival_threshold_sec integer   NOT NULL DEFAULT 600,         -- 10 min
  ADD COLUMN service_date        date,                                     -- corrida a la que se suscribe (hoy)
  ADD COLUMN last_delay_sent_at  timestamptz,                              -- anti-dup rápido
  ADD COLUMN last_arrival_sent_at timestamptz;                             -- anti-dup rápido

-- PERMITE varias suscripciones por endpoint (una por tren):
-- antes UNIQUE(user_id, endpoint) impedía suscribirse a >1 tren
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT push_subscriptions_user_id_endpoint_key,
  ADD CONSTRAINT push_subscriptions_user_id_endpoint_trip_key
    UNIQUE (user_id, endpoint, trip_code);

-- ── 2. Tabla de eventos enviados (auditoría + freno duro) ───────────────────
CREATE TABLE public.push_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  trip_code       text NOT NULL,
  event_type      text NOT NULL CHECK (event_type IN ('delay', 'arrival')),
  service_date    date NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  payload         jsonb,                          -- título/cuerpo/url enviados (auditoría)
  UNIQUE (subscription_id, trip_code, event_type, service_date)
);
CREATE INDEX push_events_sub ON public.push_events (subscription_id);

ALTER TABLE public.push_events ENABLE ROW LEVEL SECURITY;
-- El server usa service role (bypass); el cliente NO necesita leer push_events.
-- Sin policies = nadie en anon/authenticated puede acceder vía API.
```

**Cambio de constraint con datos existentes:** la clave `UNIQUE(user_id,endpoint)` se sustituye por `(user_id,endpoint,trip_code)`. Con la tabla vacía o duplicados inexistentes no da problema; si hubiera datos, se revisa antes en el dashboard.

`src/types/database.ts`: añadir las columnas nuevas a `push_subscriptions` y la tabla `push_events` (Row/Insert/Update).

## API — alta de suscripción (`/api/push/subscribe` POST)

Nuevo request schema (Zod):

```ts
const subscriptionSchema = z
  .object({
    subscription: z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
    }),
    tripCode: z.string().min(1),
    stationId: z.string().min(1).optional(), // requerido si notify_arrival
    notifyDelay: z.boolean().default(false),
    notifyArrival: z.boolean().default(false),
  })
  .refine(
    (s) => s.notifyDelay || s.notifyArrival,
    "Al menos un tipo de aviso es obligatorio",
  );
```

Reglas:

- `stationId` **obligatorio** si `notifyArrival === true`.
- Upsert con `onConflict: 'user_id,endpoint,trip_code'`, guardando las columnas nuevas y `service_date = todayISO()`.
- Requiere sesión (401 si no) y valida con Zod (400 si no).

`GET /api/push/subscriptions`: devolver también `station_id`, `notify_delay`, `notify_arrival`.

## Lógica de decisión — `src/lib/push/monitor.ts` (pura, testeable)

Funciones puras sin I/O, para unit tests:

```ts
// Retraso efectivo del tren en la estación suscrita (segundos).
// Si la parada de la estación aún no tiene stopTimeUpdate, usa el mayor
// retraso reportado entre todas las paradas del tren (propagación).
export function computeDelaySec(tripUpdate, stationId: string | null): number;

// ¿Hay que enviar el aviso de retraso?
export function shouldSendDelay(delaySec, thresholdSec, lastSentAt): boolean;
//   delaySec >= thresholdSec && (lastSentAt == null || lastSentAt < hoyInicio)

// Llegada prevista (epoch s) = llegada programada estática + retraso en esa parada
export function computePredictedArrivalSec(
  scheduledArrivalSec,
  delaySec,
): number;

// ¿Hay que enviar el aviso de llegada? Ventana [predicha - umbral, predicha + margen]
export function shouldSendArrival(
  nowSec,
  predictedSec,
  thresholdSec,
  lastSentAt,
): boolean;
//   0 <= (predictedSec - nowSec) <= thresholdSec  → "llega en ~N min"
//   + margen de 2 min tras lo predicho por si el retraso recalcula
```

La conversión hora GTFS `HH:MM:SS` → epoch ya existe (reutilizar la de `viaje/[id]/route.ts` o extraerla a `lib/utils`).

## Cron de monitorización — `/api/cron/monitor-push`

Frecuencia: **cada 1 minuto** (`"*/1 * * * *"` en `vercel.json`). Pasos:

1. Auth: `Authorization: Bearer CRON_SECRET`.
2. Query suscripciones activas con `trip_code NOT NULL`, `NOTIFY tidy`, `service_date = hoy`.
3. Agrupar por `trip_code`; clasificar feed (`cercanias` si el tripId empieza por `C`, si no `md`, reutilizando `inferTipo`).
4. Cargar GTFS-RT una sola vez por feed (`fetchTripUpdates`, con caché 20/30s existente).
5. Por cada suscripción:
   - `delay = computeDelaySec(...)`
   - Si `notify_delay` → `shouldSendDelay` → enviar push "El tren X lleva N min de retraso" y guardar evento.
   - Si `notify_arrival` → cargar llegada programada de `gtfs_stop_times` (trip+station), `predict`, `shouldSendArrival` → enviar "El tren X llega a <Estación> en ~N min".
6. Anti-duplicado: **insert del evento antes de enviar** (constraint UNIQUE como candado); si el insert falla por unique → skip. Después `sendPushNotification`. Si insert OK pero send falla → evento queda (máximo 1 intento por día; aceptable en v1).
7. `service_date` filtra suscripciones de días anteriores aunque el `trip_code` se repita (el GTFS-RT repite tripId cada día).
8. Logging: nº procesadas / nº enviadas a `console`, y errores a la tabla `api_errors` si existe patrón previo (misma utilidad que `horarios/route.ts`).

**Si el feed GTFS-RT es `stale`/vacío → no procesar** (evita falsos positivos). El cron anterior (`/api/cron/cleanup`) se **registra** en `vercel.json` para purgar `push_events` > 30 días y suscripciones inactivas.

## Service Worker — `src/sw.ts`

Añadir manejadores (Serwist `addEventListeners` + los nuestros):

```ts
self.addEventListener("push", (event) => {
  const data = event.data?.json?.() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "TrenATiempo", {
      body: data.body,
      icon: data.icon ?? "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url ?? "/";
  event.notification.close();
  event.waitUntil(clients.openWindow(url));
});
```

El cron construye `data.url` → `/viaje/{tripId}?stopId={stationId}&tipo={tipo}`.

## UI — `PushPermission.tsx`

- Recibe `tripCode` y **`stationId`** (la estación de la cabecera).
- Al pulsar la campana (usuario autenticado): abre un **diálogo** (Radix `Dialog`) con el nombre del tren y dos checkboxes:
  - "Avisarme si se retrasa"
  - "Avisarme ~10 min antes de que llegue a **{estación}**"
  - Al menos uno marcado; **Confirmar** → `Notification.requestPermission()` → `pushManager.subscribe` → `POST /api/push/subscribe` con `{ stationId, notifyDelay, notifyArrival, tripCode }`.
- Estado inicial de la suscripción: se leen los campos nuevos en `GET /api/push/subscriptions` para restaurar checkboxes.
- **En fechas futuras (`TrainCard` con fecha > hoy): la campana no se muestra** (no hay tiempo real).
- Mantener el guard `typeof Notification !== 'undefined'` (bug iOS WebKit).

## i18n — claves nuevas (`messages/*.json`)

`push.subscribeTitle`, `push.delayAlert`, `push.arrivalAlert` (`{station}`), `push.atLeastOne`, `push.confirm`, `push.delayBody` (`{train},{minutes}`), `push.arrivalBody` (`{train},{station},{minutes}`), `push.notificationTitle`, `push.delayTitle`, `push.arrivalTitle`.

## Code Style

- Funciones puras en `monitor.ts` sin importar `supabaseAdmin` (se inyectan datos).
- Zod en toda API rout; named exports.
- i18n: toda cadena visible con `t()` (prohibido texto literal).
- Sin comentarios salvo los docstring clave de lógica.

## Testing Strategy

- **Unit (Vitest)** — `tests/unit/lib/push-monitor.test.ts`:
  - `computeDelaySec`: parada presente, ausente (fallback al mayor), sin updates → 0.
  - `shouldSendDelay`: < umbral no envía; ≥ umbral envía; ya enviado hoy no reenvía.
  - `shouldSendArrival`: fuera de ventana no; dentro envía; márgenes con retraso.
  - `buildPayload`/url destino.
- **Unit** — esquema Zod del subscribe: falta stationId con arrival → error; ninguno marcado → error.
- **Route cron** — test con feeds mockeados (cer y md) y supabase mockeada: cuenta envíos + inserts de eventos.
- **E2E**: NO se cubre push en Playwright (requiere navegador real/permiso). Verificación manual: cron invocada con `curl -X POST -H "Authorization: Bearer $CRON_SECRET"` contra un tren real suscrito. (Como admin: fuera de la suite.)
- `pnpm typecheck && pnpm lint && pnpm test` antes de commit.

## Boundaries

- **Always**: validar inputs con Zod; RLS intacta (`push_events` sin policies de cliente); respetar tipos `database.ts`; correr typecheck/lint/tests; i18n en todo texto visible; scatter-gather de feeds una sola vez por cron.
- **Ask first**: la migration `007` (se aplica a mano en dashboard Supabase, workflow §12b); añadir el cron en `vercel.json`; cualquier cambio en RLS; cambiar frecuencia del cron por límites de plan Vercel.
- **Never**: exponer `VAPID_PRIVATE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` al cliente; enviar duplicados (pasado o futuro); notificar sobre feeds `stale`/vacíos; desactivar el guard de `Notification` de WebKit.

## Success Criteria

1. Un usuario autenticado puede suscribirse a un tren de hoy eligiendo uno o ambos avisos; la suscripción guarda `station_id`, tipos y `service_date`.
2. Un usuario puede suscribirse a **varios trenes** en el mismo dispositivo (constraint nuevo).
3. El cron `/api/cron/monitor-push` (cada 1 min) detecta retraso ≥ 5 min y envía UNA push; detecta llegada prevista en la ventana ~10 min y envía UNA push.
4. Anti-duplicado por `push_events` (UNIQUE) + `last_*_sent_at`.
5. El service worker muestra la notificación y clic → abre el detalle del viaje.
6. En fechas futuras la campana no aparece; en el detalle de viaje (hoy) sí.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test` pasan.
8. Migration `007` aplicada en dashboard y reflejada en `src/types/database.ts`.

## Open Questions

- **Frecuencia del cron / plan Vercel**: ¿`*/1` cada minuto está permitido en el plan actual de Vercel? Si Hobby lo limita a mínimos mayores, el aviso de llegada (10 min) sigue siendo aceptable a 5 min, pero el de retraso pierde nitidez. A decidir al implementar.
- **Margen de ventana de llegada**: propongo `[predicha−umbral, predicha+120s]`; ¿ok?
- **Delay sin parada aún reportada**: fallback al mayor retraso del feed; si el feed no trae la parada ni el tren en zona, no se notifica hasta que haya dato (evita falsos positivos). ¿Ok?
