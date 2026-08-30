-- TrenATiempo — Migration 002: Elección de consentimiento de cookies
-- Contexto: la elección del banner de cookies se persiste en profiles para
-- los usuarios registrados, de modo que se sincronice entre dispositivos.
-- NULL = el usuario aún no ha decidido (se muestra el banner).

ALTER TABLE public.profiles
  ADD COLUMN consent_choice text
    CHECK (consent_choice IN ('essential', 'analytics'));