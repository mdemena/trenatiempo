-- Migration 005: Fix get_stop_departures RPC to return t.route_id
--
-- The original query selected st.route_id from gtfs_stop_times which is always
-- empty ''.  The route_id lives in gtfs_trips and must be read from there.
--
-- Apply this migration if you already ran 004 on Supabase.

BEGIN;

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

COMMIT;
