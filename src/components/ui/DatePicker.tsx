'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'motion/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { addDaysISO, isISODate, parseFlexibleDate, todayISO } from '@/lib/utils/dates'
import { cn } from '@/lib/utils'

const LOCALE_TAGS: Record<string, string> = {
  es: 'es-ES',
  ca: 'ca-ES',
  gl: 'gl-ES',
  eu: 'eu-ES',
  en: 'en-GB',
  fr: 'fr-FR',
}

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const FIELD_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}

// Texto del campo para una fecha ISO (vacío si no hay fecha)
function fieldText(iso: string | null, localeTag: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(localeTag, FIELD_FORMAT).format(new Date(`${iso}T00:00:00Z`))
}

interface DatePickerProps {
  /** Fecha seleccionada en ISO (yyyy-mm-dd) o null = hoy */
  value: string | null
  onChange: (iso: string | null) => void
  /** Mínimo seleccionable (default: hoy) */
  minIso?: string
  /** Máximo seleccionable (default: hoy + 180 días) */
  maxIso?: string
  /** Variante compacta para cabeceras */
  compact?: boolean
  className?: string
}

export function DatePicker({ value, onChange, minIso, maxIso, compact, className }: DatePickerProps) {
  const t = useTranslations('datePicker')
  const localeTag = LOCALE_TAGS[useLocale()] ?? 'es-ES'

  const min = minIso ?? todayISO()
  // Si la cobertura de datos es menor que hoy, caemos al default
  const max = maxIso && maxIso >= min ? maxIso : addDaysISO(todayISO(), 180)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => fieldText(value, localeTag))
  const [error, setError] = useState(false)
  // Mes mostrado en el calendario (año, mes 0-11)
  const [view, setView] = useState(() => {
    const base = value ?? todayISO()
    return { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }
  })
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click fuera o pulsar Escape
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const effectiveValue = value ?? min

  const fmtDay = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
    [localeTag]
  )
  const fmtMonth = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [localeTag]
  )
  const fmtFull = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [localeTag]
  )
  // Sincronizar el input con el valor externo cuando cambie la prop
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(fieldText(value, localeTag))
    setError(false)
  }

  function commitText() {
    const raw = draft.trim()
    if (!raw) {
      onChange(null)
      setError(false)
      return
    }
    const iso = parseFlexibleDate(raw)
    if (!iso || iso < min || iso > max) {
      setError(true)
      setDraft(iso ? fieldText(iso, localeTag) : draft)
      return
    }
    setError(false)
    onChange(iso)
    setView({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 })
  }

  function openCalendar() {
    const base = effectiveValue
    setView({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 })
    setError(false)
    setOpen(true)
  }

  function pick(iso: string) {
    setError(false)
    onChange(iso)
    setDraft(fieldText(iso, localeTag))
    setView({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 })
    setOpen(false)
  }

  // Celdas del calendario (lunes primero), con ISO por día
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1))
    const offset = (first.getUTCDay() + 6) % 7
    const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
    const out: Array<{ iso: string; day: number } | null> = []
    for (let i = 0; i < offset; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({
        iso: `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
      })
    }
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [view])

  const weekdayLabels = useMemo(
    () =>
      WEEKDAY_KEYS.map((k) =>
        new Intl.DateTimeFormat(localeTag, { weekday: 'narrow', timeZone: 'UTC' }).format(
          new Date(`2024-06-${{ Mon: '03', Tue: '04', Wed: '05', Thu: '06', Fri: '07', Sat: '08', Sun: '09' }[k]}T00:00:00Z`)
        )
      ),
    [localeTag]
  )

  const minD = new Date(`${min}T00:00:00Z`)
  const maxD = new Date(`${max}T00:00:00Z`)
  // ¿Hay días seleccionables en el mes anterior / siguiente al mostrado?
  const showPrev = new Date(Date.UTC(view.y, view.m, 0)) >= minD
  const showNext = new Date(Date.UTC(view.y, view.m + 1, 1)) <= maxD

  const isToday = !isISODate(value) || value === min

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + delta, 1))
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
    })
  }

  return (
    <div ref={rootRef} className={cn('relative', compact ? 'w-40' : 'w-full', className)}>
      <div className="relative">
        <CalendarDays
          aria-hidden
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500 ${
            compact ? 'left-2.5 h-4 w-4' : 'left-3 h-5 w-5'
          }`}
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={titleId}
          aria-invalid={error}
          aria-label={t('label')}
          placeholder={t('today')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={openCalendar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitText()
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              openCalendar()
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          className={`border bg-white/[0.04] text-white outline-none transition-colors placeholder:text-slate-500 focus:border-amber-400/70 focus:bg-white/[0.07] ${
            compact
              ? 'w-full rounded-lg py-1.5 pl-8 pr-2.5 text-xs'
              : 'w-full rounded-xl py-3 pl-10 pr-3 text-sm'
          } ${error ? 'border-red-500' : 'border-white/10'}`}
        />
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-400">
          {t('invalidRange', { min: fieldText(min, localeTag), max: fieldText(max, localeTag) })}
        </p>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            id={titleId}
            role="dialog"
            aria-label={t('pickDate')}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full z-50 mt-2 rounded-xl border border-white/10 bg-[#101c30] p-3 shadow-xl shadow-black/40',
              compact ? 'left-1/2 w-[19rem] max-w-[calc(100vw-2rem)] -translate-x-1/2' : 'left-0 right-0'
            )}
          >
            {/* Cabecera mes */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={!showPrev}
                aria-label={t('prevMonth')}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-medium capitalize text-white">
                {fmtMonth.format(new Date(Date.UTC(view.y, view.m, 1)))}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={!showNext}
                aria-label={t('nextMonth')}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Días de la semana */}
            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {weekdayLabels.map((w, i) => (
                <span key={i} className="py-1 text-center text-[11px] uppercase text-slate-500">
                  {w}
                </span>
              ))}
            </div>

            {/* Días */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, i) => {
                if (!cell) return <span key={i} />
                const disabled = cell.iso < min || cell.iso > max
                const selected = cell.iso === effectiveValue
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(cell.iso)}
                    aria-label={fmtDay.format(new Date(`${cell.iso}T00:00:00Z`))}
                    aria-pressed={selected}
                    title={fmtFull.format(new Date(`${cell.iso}T00:00:00Z`))}
                    className={`aspect-square rounded-lg text-xs transition-colors ${
                      selected
                        ? 'bg-amber-400 font-bold text-slate-900'
                        : disabled
                          ? 'cursor-not-allowed text-slate-600'
                          : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>

            {/* Acceso rápido a hoy */}
            {!isToday && min === todayISO() && (
              <button
                type="button"
                onClick={() => pick(min)}
                className="mt-2 w-full rounded-lg py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-white/5"
              >
                {t('backToToday')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
