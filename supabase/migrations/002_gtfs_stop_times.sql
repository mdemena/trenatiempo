-- Migration 002: gtfs_stop_times
-- Stores today's departure schedule imported from Renfe GTFS static feed.
-- Refreshed daily by `pnpm seed:horarios`. Only one day of data is kept at a time.

CREATE TABLE IF NOT EXISTS public.gtfs_stop_times (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id        text    NOT NULL,
  route_id       text,
  stop_id        text    NOT NULL,
  stop_sequence  int     NOT NULL,
  departure_time text    NOT NULL,   -- "HH:MM:SS" local time (Europe/Madrid)
  service_date   date    NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (trip_id, stop_id, service_date)
);

CREATE INDEX IF NOT EXISTS idx_gtfs_st_stop_time
  ON public.gtfs_stop_times (stop_id, departure_time);

CREATE INDEX IF NOT EXISTS idx_gtfs_st_service_date
  ON public.gtfs_stop_times (service_date);

-- RLS
ALTER TABLE public.gtfs_stop_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gtfs_stop_times readable by all"
  ON public.gtfs_stop_times FOR SELECT USING (true);
