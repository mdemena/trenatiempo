// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CONSENT_COOKIE,
  parseConsentCookie,
  readConsent,
  saveConsent,
  applyConsent,
} from '@/lib/consent'

describe('consent', () => {
  beforeEach(() => {
    window.dataLayer = []
    document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseConsentCookie', () => {
    it('devuelve null sin cookie', () => {
      expect(parseConsentCookie(undefined)).toBeNull()
      expect(parseConsentCookie('')).toBeNull()
    })

    it('devuelve null con valores desconocidos', () => {
      expect(parseConsentCookie(`${CONSENT_COOKIE}=otra_cosa`)).toBeNull()
    })

    it('devuelve la elección guardada', () => {
      expect(parseConsentCookie(`${CONSENT_COOKIE}=analytics`)).toBe('analytics')
      expect(parseConsentCookie(`${CONSENT_COOKIE}=essential`)).toBe('essential')
    })

    it('ignora otras cookies', () => {
      const header = `foo=bar; ${CONSENT_COOKIE}=analytics; baz=qux`
      expect(parseConsentCookie(header)).toBe('analytics')
    })
  })

  describe('readConsent / saveConsent', () => {
    it('readConsent devuelve null sin elección previa', () => {
      expect(readConsent()).toBeNull()
    })

    it('saveConsent guarda y readConsent recupera', () => {
      saveConsent('essential')
      expect(readConsent()).toBe('essential')
      saveConsent('analytics')
      expect(readConsent()).toBe('analytics')
    })
  })

  describe('applyConsent', () => {
    it('empuja el estado correcto a la dataLayer con analytics', () => {
      window.gtag = undefined
      applyConsent('analytics')
      expect(window.dataLayer).toHaveLength(1)
      const entry = window.dataLayer[0] as unknown[]
      expect(entry[0]).toBe('consent')
      expect(entry[1]).toBe('update')
      expect(entry[2]).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied' })
    })

    it('niega analytics_storage con essential', () => {
      applyConsent('essential')
      const entry = window.dataLayer[0] as { analytics_storage: string }[]
      expect(entry[2]).toMatchObject({ analytics_storage: 'denied' })
    })

    it('usa gtag() si está disponible', () => {
      const gtag = vi.fn()
      window.gtag = gtag
      applyConsent('analytics')
      expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'granted' }))
    })
  })
})