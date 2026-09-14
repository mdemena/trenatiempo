-- Migration 009: corrige la identidad de tren en push_subscriptions
--
-- La 008 creó UNIQUE INDEX (user_id, endpoint, train_number, route_id) SIN
-- quitar el UNIQUE (user_id, endpoint, trip_code) de la 007. Ese doble
-- constraint hacia que el `INSERT ... ON CONFLICT` del upsert de
-- /api/push/subscribe fallara con 23505 (el árbitro del ON CONFLICT es la
-- 008, pero una fila nueva que chocara con la 007 lanzaba error), de modo que
-- suscripciones que parecían aceptadas nunca se guardaban.
--
-- Además, el backfill de la 008 usaba `\2` con una sola pareja de captura:
-- route_id quedaba a '' (vacío) en lugar de la línea real.

-- ─── 1) Quitar el constraint de 007 (la unicidad real es la del tren) ────────
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_endpoint_trip_key;

-- ─── 2) Normalizar route_id vacío → NULL ──────────────────────────────────────
UPDATE public.push_subscriptions
SET route_id = NULL
WHERE route_id = '';

-- ─── 3) Re-backfill de route_id (cercanías) con la línea real ────────────────
-- "5154D15726R11" → R11 · "6265J71110C2" → C2 · "4770M00024BUS" → BUS
UPDATE public.push_subscriptions
SET route_id = regexp_replace(
  trip_code,
  '^\d+[A-Za-z](\d+)([A-Za-z]\d*[A-Za-z]*)$',
  '\2'
)
WHERE route_id IS NULL
  AND trip_code ~ '^\d+[A-Za-z](\d+)([A-Za-z]\d*[A-Za-z]*)$';

-- MD/AV sin línea ("0019212026-09-01") NO casan con el patrón anterior:
-- su route_id se queda a NULL, que es lo correcto (identidad = train_number).