// Consentimiento de cookies (Consent Mode v2).
// Fuente única de verdad para leer/guardar la elección y empujarla a GTM.

export type ConsentChoice = 'essential' | 'analytics'

export const CONSENT_COOKIE = 'trenatiempo_consent'
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/** Parsea la cabecera/valor de cookie sin depender del DOM (testeable en node) */
export function parseConsentCookie(cookieHeader: string | undefined): ConsentChoice | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
  if (!match) return null
  const value = decodeURIComponent(match[1])
  return value === 'analytics' || value === 'essential' ? value : null
}

/** Lee la elección guardada, o null si el usuario aún no ha decidido */
export function readConsent(): ConsentChoice | null {
  if (typeof document === 'undefined') return null
  return parseConsentCookie(document.cookie)
}

/** Guarda la elección en una cookie persistente (1 año) */
export function saveConsent(choice: ConsentChoice): void {
  if (typeof document === 'undefined') return
  document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=Lax`
}

/** Estado de consentimiento a enviar a GTM */
function consentState(choice: ConsentChoice) {
  return {
    analytics_storage: choice === 'analytics' ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  }
}

/** Empuja el estado de consentimiento a la dataLayer de GTM */
export function applyConsent(choice: ConsentChoice): void {
  if (typeof window === 'undefined') return
  const args: unknown[] = ['consent', 'update', consentState(choice)]
  if (typeof window.gtag === 'function') {
    window.gtag(...args)
  } else {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push(args)
  }
}