-- RodaRail — Migration 001: Schema inicial
-- Ejecutar con: supabase db reset

-- ─── Extensiones ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Para búsqueda fuzzy de estaciones

-- ─── Perfiles de usuario ──────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text,
  full_name        text,
  avatar_url       text,
  role             text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  active           boolean NOT NULL DEFAULT true,
  preferred_locale text NOT NULL DEFAULT 'es'
                     CHECK (preferred_locale IN ('es', 'ca', 'gl', 'eu', 'en', 'fr')),
  last_seen        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: crear perfil al registrar usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, preferred_locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'user',
    COALESCE(NEW.raw_user_meta_data->>'preferred_locale', 'es')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Estaciones ───────────────────────────────────────────────────────────────
CREATE TABLE public.stations (
  id          text PRIMARY KEY,  -- Código ADIF (ej: "60000")
  name        text NOT NULL,
  short_name  text,
  lat         float8,
  lng         float8,
  province    text,
  region      text,
  types       text[] NOT NULL DEFAULT '{}',  -- ['cercanias', 'md', 'ave', 'regional']
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER stations_updated_at
  BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índice para búsqueda por nombre (trigram)
CREATE INDEX stations_name_trgm ON public.stations USING gin (name gin_trgm_ops);
CREATE INDEX stations_short_name_trgm ON public.stations USING gin (short_name gin_trgm_ops);
-- Índice para búsqueda por coordenadas
CREATE INDEX stations_lat_lng ON public.stations (lat, lng) WHERE active = true;

-- ─── Favoritos de estaciones ──────────────────────────────────────────────────
CREATE TABLE public.favorite_stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  station_id  text NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, station_id)
);

CREATE INDEX fav_stations_user ON public.favorite_stations (user_id);

-- ─── Favoritos de viajes ──────────────────────────────────────────────────────
CREATE TABLE public.favorite_trips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trip_code   text NOT NULL,       -- Código de tren ADIF (ej: "C-3", "R598")
  line_name   text,
  origin_id   text REFERENCES public.stations(id),
  dest_id     text REFERENCES public.stations(id),
  schedule    text,                -- Descripción del horario habitual
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fav_trips_user ON public.favorite_trips (user_id);

-- ─── Suscripciones push ───────────────────────────────────────────────────────
CREATE TABLE public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  trip_code   text,    -- NULL = alertas generales
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX push_subs_user ON public.push_subscriptions (user_id);
CREATE INDEX push_subs_trip ON public.push_subscriptions (trip_code) WHERE active = true;

-- ─── Reportes de estado colaborativos ────────────────────────────────────────
CREATE TABLE public.trip_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  trip_code   text NOT NULL,
  date        date NOT NULL,
  on_time     boolean,
  train_short boolean,   -- true = convoy corto
  delay_mins  integer,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trip_reports_code_date ON public.trip_reports (trip_code, date);

-- ─── Caché de horarios ADIF ───────────────────────────────────────────────────
CREATE TABLE public.adif_cache (
  key         text PRIMARY KEY,   -- hash de los parámetros de búsqueda
  data        jsonb NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX adif_cache_expires ON public.adif_cache (expires_at);

-- Limpiar entradas expiradas (ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_adif_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.adif_cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- profiles: lectura pública de datos básicos, edición solo propio perfil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles: lectura pública" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Profiles: edición propia" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- stations: lectura pública, escritura solo admins
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stations: lectura pública" ON public.stations
  FOR SELECT USING (true);

CREATE POLICY "Stations: escritura admin" ON public.stations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- favorite_stations: solo el propietario
ALTER TABLE public.favorite_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fav stations: solo propietario" ON public.favorite_stations
  FOR ALL USING (user_id = auth.uid());

-- favorite_trips: solo el propietario
ALTER TABLE public.favorite_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fav trips: solo propietario" ON public.favorite_trips
  FOR ALL USING (user_id = auth.uid());

-- push_subscriptions: solo el propietario
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Push subs: solo propietario" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- trip_reports: lectura pública, escritura solo autenticados
ALTER TABLE public.trip_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip reports: lectura pública" ON public.trip_reports
  FOR SELECT USING (true);

CREATE POLICY "Trip reports: escritura autenticados" ON public.trip_reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- adif_cache: acceso solo desde servidor (service_role)
ALTER TABLE public.adif_cache ENABLE ROW LEVEL SECURITY;
-- Sin políticas = solo service_role puede acceder
