-- TrenATiempo — Migration 007: Push trip alerts (retraso + llegada)
-- Aplicar en Supabase → SQL Editor → New query → Run.
--
-- 1) push_subscriptions: columnas de configuración y estado de envío.
-- 2) UNIQUE (user_id, endpoint) → (user_id, endpoint, trip_code): permite
--    suscribirse a varios trenes desde el mismo dispositivo.
-- 3) Tabla push_events: deduplicación/single-flight del monitor.

-- ─── 1) Columnas nuevas en push_subscriptions ────────────────────────────────
ALTER TABLE public.push_subscriptions
  ADD COLUMN station_id           text REFERENCES public.stations(id) ON DELETE CASCADE,
  ADD COLUMN notify_delay         boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_arrival       boolean NOT NULL DEFAULT true,
  ADD COLUMN delay_threshold_sec  integer NOT NULL DEFAULT 300,
  ADD COLUMN arrival_threshold_sec integer NOT NULL DEFAULT 600,
  ADD COLUMN service_date         text,   -- ISO yyyy-mm-dd de la corrida suscrita
  ADD COLUMN last_delay_sent_at   timestamptz,
  ADD COLUMN last_arrival_sent_at timestamptz;

-- Índice para el monitor: suscripciones activas de hoy con estación y tipo
CREATE INDEX push_subs_monitor
  ON public.push_subscriptions (service_date)
  WHERE active = true AND station_id IS NOT NULL;

-- ─── 2) Constraint de unicidad por dispositivo × tren ────────────────────────
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_endpoint_trip_key
  UNIQUE (user_id, endpoint, trip_code);

-- Garantiza que una suscripción tiene un tipo de aviso activo
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_has_type_check
  CHECK (notify_delay OR notify_arrival);

-- Garantiza que una suscripción de llegada tiene estación
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_arrival_needs_station_check
  CHECK (NOT notify_arrival OR station_id IS NOT NULL);

-- ─── 3) Tabla push_events (deduplicación) ────────────────────────────────────
CREATE TABLE public.push_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  trip_code       text NOT NULL,
  event_type      text NOT NULL CHECK (event_type IN ('delay', 'arrival')),
  service_date    text NOT NULL,          -- ISO yyyy-mm-dd
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Una notificación por (suscripción, tren, tipo, día). El INSERT previo al envío
-- actúa de candado para que dos monitores concurrentes no envíen duplicados.
CREATE UNIQUE INDEX push_events_once_per_day
  ON public.push_events (subscription_id, trip_code, event_type, service_date);

CREATE INDEX push_events_subscription
  ON public.push_events (subscription_id, created_at);

-- ─── 4) RLS ──────────────────────────────────────────────────────────────────
-- push_subscriptions ya tiene RLS ("Push subs: solo propietario") de la 001.

-- push_events: sin policies → accesible solo con service_role (server).
ALTER TABLE public.push_events ENABLE ROW LEVEL SECURITY;