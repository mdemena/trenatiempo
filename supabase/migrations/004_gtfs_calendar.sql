-- Migration 004: multi-date schedule support (GTFS calendar model)
--
-- Until now gtfs_stop_times stored a single day (service_date = today) and was
-- wiped/re-imported daily. To support "travel on a future date" we switch to
-- the standard GTFS model: store the calendar once and resolve which services
-- run on any given date at query time.
--
-- Feed coverage observed (Aug 2026):
--   Cercanías  → ~30 days ahead, one service_id per single day
--   AV/LD/MD   → ~4 months ahead, services by range + calendar_dates exceptions
--
-- trip_ids are globally unique across both feeds (verified: 0 collisions), so
-- stop_times no longer need service_date.

BEGIN;

-- ─── Calendar services (calendar.txt) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gtfs_services (
  service_id   text    NOT NULL,
  feed_source  text    NOT NULL DEFAULT 'cercanias'
               CHECK (feed_source IN ('cercanias', 'md')),
  start_date   date    NOT NULL,
  end_date     date    NOT NULL,
  monday       boolean NOT NULL DEFAULT false,
  tuesday      boolean NOT NULL DEFAULT false,
  wednesday    boolean NOT NULL DEFAULT false,
  thursday     boolean NOT NULL DEFAULT false,
  friday       boolean NOT NULL DEFAULT false,
  saturday     boolean NOT NULL DEFAULT false,
  sunday       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (service_id, feed_source),
  CONSTRAINT gtfs_services_dates_check CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_gtfs_services_end_date
  ON public.gtfs_services (end_date);

-- ─── calendar_dates.txt exceptions ──────────────────────────────────────────
-- exception_type: 1 = service added on that date, 2 = service removed

CREATE TABLE IF NOT EXISTS public.gtfs_service_exceptions (
  service_id      text     NOT NULL,
  feed_source     text     NOT NULL,
  exception_date  date     NOT NULL,
  exception_type  smallint NOT NULL CHECK (exception_type IN (1, 2)),
  PRIMARY KEY (service_id, feed_source, exception_date),
  FOREIGN KEY (service_id, feed_source)
    REFERENCES public.gtfs_services (service_id, feed_source) ON DELETE CASCADE
);

-- ─── Trips (trip → service mapping) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gtfs_trips (
  trip_id      text PRIMARY KEY,
  service_id   text NOT NULL,
  feed_source  text NOT NULL,
  route_id     text,
  FOREIGN KEY (service_id, feed_source)
    REFERENCES public.gtfs_services (service_id, feed_source) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gtfs_trips_service
  ON public.gtfs_trips (feed_source, service_id);

-- ─── Stop times: drop single-day model ──────────────────────────────────────

ALTER TABLE public.gtfs_stop_times
  DROP CONSTRAINT IF EXISTS gtfs_stop_times_trip_id_stop_id_service_date_key;

ALTER TABLE public.gtfs_stop_times
  DROP COLUMN IF EXISTS service_date;

DROP INDEX IF EXISTS public.idx_gtfs_st_service_date;

-- Old single-day rows reference trips that don't exist in gtfs_trips yet,
-- so the new FK below would fail on them. Data is transient (re-seeded by
-- scripts/seed-horarios.mjs), therefore we clear it here. Run the seed
-- right after applying this migration.
TRUNCATE TABLE public.gtfs_stop_times;

ALTER TABLE public.gtfs_stop_times
  ADD CONSTRAINT gtfs_stop_times_trip_stop_unique UNIQUE (trip_id, stop_id);

ALTER TABLE public.gtfs_stop_times
  ADD CONSTRAINT gtfs_stop_times_trip_fk
  FOREIGN KEY (trip_id) REFERENCES public.gtfs_trips (trip_id) ON DELETE CASCADE;

-- ─── RPC: departures at one station for an arbitrary date ───────────────────
-- Full GTFS semantics:
--   active = (in calendar range AND weekday flag AND not removed via type-2)
--            OR added via type-1 exception.
-- p_min_time ("HH:MM:SS") filters past departures; pass NULL for future dates.

CREATE OR REPLACE FUNCTION public.get_stop_departures(
  p_stop_id   text,
  p_date      date,
  p_feed      text DEFAULT NULL,
  p_min_time  text DEFAULT NULL
)
RETURNS TABLE (
  trip_id         text,
  route_id        text,
  departure_time  text,
  stop_sequence   int,
  feed_source     text
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH active_services AS (
    SELECT s.service_id, s.feed_source
    FROM public.gtfs_services s
    WHERE p_date BETWEEN s.start_date AND s.end_date
      AND CASE EXTRACT(ISODOW FROM p_date)::int
            WHEN 1 THEN s.monday
            WHEN 2 THEN s.tuesday
            WHEN 3 THEN s.wednesday
            WHEN 4 THEN s.thursday
            WHEN 5 THEN s.friday
            WHEN 6 THEN s.saturday
            ELSE s.sunday
          END
      AND NOT EXISTS (
        SELECT 1 FROM public.gtfs_service_exceptions e
        WHERE e.service_id = s.service_id
          AND e.feed_source = s.feed_source
          AND e.exception_date = p_date
          AND e.exception_type = 2
      )
    UNION
    SELECT e.service_id, e.feed_source
    FROM public.gtfs_service_exceptions e
    WHERE e.exception_date = p_date AND e.exception_type = 1
  )
  SELECT st.trip_id, t.route_id, st.departure_time, st.stop_sequence, st.feed_source
  FROM public.gtfs_stop_times st
  JOIN public.gtfs_trips t
    ON t.trip_id = st.trip_id AND t.feed_source = st.feed_source
  JOIN active_services a
    ON a.service_id = t.service_id AND a.feed_source = t.feed_source
  WHERE st.stop_id = p_stop_id
    AND (p_feed IS NULL OR st.feed_source = p_feed)
    AND (p_min_time IS NULL OR st.departure_time >= p_min_time)
  ORDER BY st.departure_time, st.stop_sequence
  LIMIT 200
$$;

GRANT EXECUTE ON FUNCTION public.get_stop_departures(text, date, text, text)
  TO anon, authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.gtfs_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtfs_service_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtfs_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gtfs_services readable by all"
  ON public.gtfs_services FOR SELECT USING (true);

CREATE POLICY "gtfs_service_exceptions readable by all"
  ON public.gtfs_service_exceptions FOR SELECT USING (true);

CREATE POLICY "gtfs_trips readable by all"
  ON public.gtfs_trips FOR SELECT USING (true);

COMMIT;
