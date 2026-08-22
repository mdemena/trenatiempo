import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  addDaysISO,
  isISODate,
  parseFlexibleDate,
  todayISO,
} from '@/lib/utils/dates'

describe('lib/utils/dates', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('todayISO', () => {
    it('returns the current date in Madrid timezone', () => {
      // 2026-08-22 23:30 UTC → 2026-08-23 in Madrid (UTC+2 in summer)
      vi.setSystemTime(new Date('2026-08-22T23:30:00Z'))
      expect(todayISO()).toBe('2026-08-23')
    })

    it('handles winter timezone offset', () => {
      // 2026-01-15 23:30 UTC → 2026-01-16 in Madrid (UTC+1)
      vi.setSystemTime(new Date('2026-01-15T23:30:00Z'))
      expect(todayISO()).toBe('2026-01-16')
    })
  })

  describe('isISODate', () => {
    it('accepts valid ISO dates', () => {
      expect(isISODate('2026-08-22')).toBe(true)
      expect(isISODate('2026-02-28')).toBe(true)
    })

    it('rejects invalid formats and impossible dates', () => {
      expect(isISODate(null)).toBe(false)
      expect(isISODate('')).toBe(false)
      expect(isISODate('22/08/2026')).toBe(false)
      expect(isISODate('2026-8-2')).toBe(false)
      expect(isISODate('2026-13-01')).toBe(false)
    })
  })

  describe('addDaysISO', () => {
    it('adds days within a month', () => {
      expect(addDaysISO('2026-08-22', 5)).toBe('2026-08-27')
    })

    it('crosses month boundaries', () => {
      expect(addDaysISO('2026-08-30', 3)).toBe('2026-09-02')
    })

    it('crosses year boundaries', () => {
      expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    })

    it('handles leap years', () => {
      expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29')
      expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
    })
  })

  describe('parseFlexibleDate', () => {
    it('parses ISO format', () => {
      expect(parseFlexibleDate('2026-08-22')).toBe('2026-08-22')
    })

    it('parses compact yyyymmdd', () => {
      expect(parseFlexibleDate('20260822')).toBe('2026-08-22')
    })

    it('parses dd/mm/yyyy with slashes, dots and dashes', () => {
      expect(parseFlexibleDate('22/08/2026')).toBe('2026-08-22')
      expect(parseFlexibleDate('22.8.26')).toBe('2026-08-22')
      expect(parseFlexibleDate('22-08-2026')).toBe('2026-08-22')
    })

    it('normalizes single-digit day and month', () => {
      expect(parseFlexibleDate('5/3/2026')).toBe('2026-03-05')
    })

    it('rejects impossible calendar dates like 31/02', () => {
      expect(parseFlexibleDate('31/02/2026')).toBeNull()
      expect(parseFlexibleDate('2026-02-31')).toBeNull()
    })

    it('rejects garbage and empty input', () => {
      expect(parseFlexibleDate('abc')).toBeNull()
      expect(parseFlexibleDate('')).toBeNull()
      expect(parseFlexibleDate('   ')).toBeNull()
      expect(parseFlexibleDate('32/13/2026')).toBeNull()
    })
  })
})
