-- Migration 008: suscripciones push por tren (independientes del día)
--
-- La suscripción se ancla al TREN (número + línea), no a la corrida de un día:
-- el monitor resuelve cada día el trip_id real desde GTFS (gtfs_trips +
-- gtfs_services) y avisa TODOS los días que ese tren circule. service_date
-- pasa a ser informativo (fecha desde la que se suscribió).

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS train_number text,
  ADD COLUMN IF NOT EXISTS route_id text;

-- ─── Backfill desde trip_code (best-effort para filas legacy) ────────────────
-- MD/AV con fecha incrustada: "0019212026-09-01" → número "001921"
UPDATE public.push_subscriptions
SET train_number = regexp_replace(trip_code, '^(\d+)20\d{2}-\d{2}-\d{2}', '\1')
WHERE train_number IS NULL
  AND trip_code ~ '^\d+20\d{2}-\d{2}-\d{2}';

-- Cercanías: "5154D15726R11" → número "15726", línea "R11"
--            "6265J71110C2"  → número "71110", línea "C2"
--            "4770M00024BUS" → número "00024", línea "BUS"
-- (La v1 de este fichero usaba `\2` con 1 sola pareja de captura: en vez de la
-- línea dejaba route_id a ''. La migration 009 lo corrige en bases existentes.)
UPDATE public.push_subscriptions
SET
  train_number = regexp_replace(trip_code, '^\d+[A-Za-z](\d+)([A-Za-z]\d*[A-Za-z]*)$', '\1'),
  route_id = regexp_replace(trip_code, '^\d+[A-Za-z](\d+)([A-Za-z]\d*[A-Za-z]*)$', '\2')
WHERE train_number IS NULL
  AND trip_code ~ '^\d+[A-Za-z](\d+)([A-Za-z]\d*[A-Za-z]*)$';

-- Cercanías con guion: "C1-23537" → número "23537", línea "C1"
UPDATE public.push_subscriptions
SET
  train_number = regexp_replace(trip_code, '^.*?(\d{3,})$', '\1'),
  route_id = regexp_replace(trip_code, '^([A-Za-z0-9]*?)[-].*$', '\1')
WHERE train_number IS NULL
  AND trip_code ~ '^[A-Za-z]+\d+-\d+$';

-- Unicidad por dispositivo + tren (número + línea). Suscribirse al mismo tren
-- en otro día UPSERTA la fila en lugar de duplicarla.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_train_uniq
  ON public.push_subscriptions (user_id, endpoint, train_number, route_id);