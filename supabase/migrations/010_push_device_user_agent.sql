-- 010_push_device_info.sql
-- Información legible del dispositivo/navegador que registró la suscripción push,
-- para mostrar DÓNDE llegará la notificación en la lista de alertas.
-- Se rellena desde el cliente con la mejor API disponible:
--   Chromium 90+:  navigator.userAgentData.getHighEntropyValues (modelo real)
--   Safari/Firefox: User-Agent parseado como fallback.

ALTER TABLE public.push_subscriptions
  ADD COLUMN device_browser text,   -- Chrome, Safari, Firefox, Edge …
  ADD COLUMN device_os text,       -- Android, iOS, Windows, macOS, Linux
  ADD COLUMN device_model text;    -- Pixel 8, iPhone 15 Pro, null (desktops no reportan modelo)