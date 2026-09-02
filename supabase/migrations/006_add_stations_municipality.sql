-- 006_add_stations_municipality.sql
-- Añade localidad/municipio a las estaciones para el filtrado del panel admin.
-- `province` y `region` ya existen (nullable); se rellenan junto a `municipality`
-- via el script scripts/enrich-stations.mjs (reverse geocoding offline).

ALTER TABLE public.stations
  ADD COLUMN municipality text;

-- Índice para filtrar/agrupar por localidad
CREATE INDEX stations_province_municipality_idx
  ON public.stations (province, municipality);

-- Índice para agrupar localidades dentro de una provincia en los desplegables
CREATE INDEX stations_province_idx
  ON public.stations (province);