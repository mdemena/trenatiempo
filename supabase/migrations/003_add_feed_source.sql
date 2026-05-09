-- Migration 003: add feed_source to gtfs_stop_times
-- Distinguishes which GTFS feed each trip came from:
--   'cercanias' → Cercanías + Rodalies (incl. R-prefixed Rodalies routes)
--   'md'        → Media Distancia + Regional (incl. R-prefixed Regional routes)
-- This is the only reliable way to filter by train type, since route_id
-- prefixes (C vs R) overlap between the two feeds.

ALTER TABLE public.gtfs_stop_times
  ADD COLUMN feed_source text NOT NULL DEFAULT 'cercanias'
  CHECK (feed_source IN ('cercanias', 'md'));

CREATE INDEX IF NOT EXISTS idx_gtfs_st_feed_source
  ON public.gtfs_stop_times (feed_source);
