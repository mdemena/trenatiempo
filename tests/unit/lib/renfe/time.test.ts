import { describe, it, expect } from 'vitest'
import {
  gtfsTimeToSeconds,
  secondsToGtfsTime,
  gtfsTimeToUnix,
  todayISO,
  unixToMadridTime,
} from '@/lib/renfe/time'

describe('gtfsTimeToSeconds', () => {
  it('convierte HH:MM:SS a segundos', () => {
    expect(gtfsTimeToSeconds('01:30:00')).toBe(5400)
    expect(gtfsTimeToSeconds('00:00:00')).toBe(0)
    expect(gtfsTimeToSeconds('25:00:00')).toBe(90000)
  })
})

describe('secondsToGtfsTime', () => {
  it('convierte segundos a HH:MM:SS (≥24h permitido)', () => {
    expect(secondsToGtfsTime(5400)).toBe('01:30:00')
    expect(secondsToGtfsTime(90000)).toBe('25:00:00')
    expect(secondsToGtfsTime(0)).toBe('00:00:00')
  })
})

describe('round trip', () => {
  it('es inverso', () => {
    expect(secondsToGtfsTime(gtfsTimeToSeconds('23:59:59'))).toBe('23:59:59')
  })
})

describe('gtfsTimeToUnix', () => {
  // 2026-03-02 es lunes; en marzo Madrid está en CET (UTC+1).
  it('resuelve hora normal dentro del día (CET)', () => {
    const ts = gtfsTimeToUnix('10:30:00', '2026-03-02')
    // 2026-03-02 00:00 UTC+1 = 2026-03-01 23:00 UTC
    expect(ts).toBe(Math.floor(Date.UTC(2026, 2, 1, 23, 0, 0) / 1000) + 10 * 3600 + 30 * 60)
  })

  it('resuelve hora ≥ 24h cruzando a la siguiente fecha', () => {
    const ts = gtfsTimeToUnix('25:05:00', '2026-03-02')
    // Madrid 2026-03-03 01:05 = UTC+1 → 2026-03-03 00:05 UTC
    expect(ts).toBe(Math.floor(Date.UTC(2026, 2, 3, 0, 5, 0) / 1000))
  })

  it('respeta el offset de verano (CEST, UTC+2)', () => {
    const ts = gtfsTimeToUnix('10:00:00', '2026-07-02')
    // 2026-07-02 00:00 UTC+2 = 2026-07-01 22:00 UTC
    expect(ts).toBe(Math.floor(Date.UTC(2026, 6, 1, 22, 0, 0) / 1000) + 10 * 3600)
  })
})

describe('todayISO', () => {
  it('devuelve la fecha actual en formato ISO yyyy-mm-dd', () => {
    const iso = todayISO()
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // No puede estar en el futuro
    expect(new Date(`${iso}T00:00:00Z`).getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000)
  })
})

describe('unixToMadridTime', () => {
  it('formatea como HH:MM:SS (Madrid)', () => {
    const ts = gtfsTimeToUnix('14:00:00', '2026-03-02')
    const madrid = unixToMadridTime(ts)
    // Tolerante al padding del navegador (14:00:00 vs 14:00:00)
    expect(madrid.replace(/^0/, '').slice(0, 5)).toBe('14:00')
    expect(madrid.endsWith(':00')).toBe(true)
  })
})