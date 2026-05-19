'use client'

import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'motion/react'
import { MapPin, Loader2, RotateCcw, Search } from 'lucide-react'
import { useNearestStation } from '@/hooks/useNearestStation'
import { cn } from '@/lib/utils'
import type { Estacion, EstacionConDistancia, TipoServicio } from '@/lib/renfe/types'

// ─── Service badge ────────────────────────────────────────────────────────────

const SERVICE_LABEL: Record<TipoServicio, string> = {
  cercanias: 'Cercanías',
  md: 'MD',
  ave: 'AVE',
  regional: 'Regional',
  ld: 'LD',
}

const SERVICE_COLOR: Record<TipoServicio, string> = {
  cercanias: 'bg-rail-amber/15 text-rail-amber',
  md: 'bg-blue-500/15 text-blue-300',
  ave: 'bg-purple-500/15 text-purple-300',
  regional: 'bg-rail-green/15 text-rail-green',
  ld: 'bg-white/10 text-rail-cream/60',
}

function ServiceBadge({ type }: { type: TipoServicio }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        SERVICE_COLOR[type]
      )}
    >
      {SERVICE_LABEL[type]}
    </span>
  )
}

// ─── Highlight matching text ──────────────────────────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-rail-amber/25 text-rail-amber not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  )
}

// ─── Search state reducer ─────────────────────────────────────────────────────

type SearchState = {
  results: Estacion[]
  loading: boolean
  isOpen: boolean
  activeIndex: number
}

const initialSearchState: SearchState = {
  results: [],
  loading: false,
  isOpen: false,
  activeIndex: -1,
}

type SearchAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_DONE'; results: Estacion[] }
  | { type: 'FETCH_ERROR' }
  | { type: 'GPS_DONE' }
  | { type: 'RESET' }
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'SET_ACTIVE_INDEX'; index: number }

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true }
    case 'FETCH_DONE':
      return { results: action.results, loading: false, isOpen: true, activeIndex: -1 }
    case 'FETCH_ERROR':
      return { ...state, loading: false }
    case 'GPS_DONE':
      return { ...state, isOpen: true, activeIndex: -1 }
    case 'RESET':
      return { ...initialSearchState }
    case 'OPEN':
      return { ...state, isOpen: true }
    case 'CLOSE':
      return { ...state, isOpen: false, activeIndex: -1 }
    case 'SET_ACTIVE_INDEX':
      return { ...state, activeIndex: action.index }
  }
}

// ─── StationSearch ────────────────────────────────────────────────────────────

export interface StationSearchProps {
  onSelect: (estacion: Estacion) => void
}

export function StationSearch({ onSelect }: StationSearchProps) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [searchState, dispatch] = useReducer(searchReducer, initialSearchState)
  const [isGpsMode, setIsGpsMode] = useState(false)

  const { loading: gpsLoading, geoError, stations: gpsStations, trigger: triggerGPS } =
    useNearestStation()
  const inputRef = useRef<HTMLInputElement>(null)

  // Text search with 300ms debounce
  useEffect(() => {
    if (isGpsMode || query.trim().length < 2) {
      if (!isGpsMode) {
        dispatch({ type: 'RESET' })
      }
      return
    }

    dispatch({ type: 'FETCH_START' })
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/renfe/estaciones?q=${encodeURIComponent(query.trim())}&limit=8`
        )
        if (!res.ok) throw new Error('fetch error')
        const data = (await res.json()) as { estaciones?: Estacion[] }
        dispatch({ type: 'FETCH_DONE', results: data.estaciones ?? [] })
      } catch {
        dispatch({ type: 'FETCH_ERROR' })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, isGpsMode])

  // Open dropdown when GPS stations arrive
  useEffect(() => {
    if (isGpsMode && gpsStations.length > 0) {
      dispatch({ type: 'GPS_DONE' })
    }
  }, [isGpsMode, gpsStations])

  const currentItems: (Estacion | EstacionConDistancia)[] = isGpsMode
    ? gpsStations
    : searchState.results

  const handleSelect = useCallback(
    (station: Estacion) => {
      onSelect(station)
      setQuery('')
      dispatch({ type: 'RESET' })
      setIsGpsMode(false)
    },
    [onSelect]
  )

  const handleGPS = useCallback(() => {
    setIsGpsMode(true)
    setQuery('')
    dispatch({ type: 'RESET' })
    triggerGPS()
    inputRef.current?.blur()
  }, [triggerGPS])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setIsGpsMode(false)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!searchState.isOpen || currentItems.length === 0) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          dispatch({ type: 'SET_ACTIVE_INDEX', index: Math.min(searchState.activeIndex + 1, currentItems.length - 1) })
          break
        case 'ArrowUp':
          e.preventDefault()
          dispatch({ type: 'SET_ACTIVE_INDEX', index: Math.max(searchState.activeIndex - 1, -1) })
          break
        case 'Enter':
          e.preventDefault()
          if (searchState.activeIndex >= 0) {
            const item = currentItems[searchState.activeIndex]
            if (item) handleSelect(item)
          }
          break
        case 'Escape':
          e.preventDefault()
          dispatch({ type: 'CLOSE' })
          break
      }
    },
    [searchState.isOpen, searchState.activeIndex, currentItems, handleSelect]
  )

  const isLoading = searchState.loading || gpsLoading

  return (
    <div className="relative w-full">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rail-cream/25" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => currentItems.length > 0 && dispatch({ type: 'OPEN' })}
            onBlur={() => setTimeout(() => dispatch({ type: 'CLOSE' }), 150)}
            placeholder={t('home.searchPlaceholder')}
            className="w-full rounded-2xl bg-white/8 py-3.5 pl-10 pr-10 text-rail-cream placeholder:text-rail-cream/30 outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-rail-amber/50 light:bg-black/5 light:ring-black/10"
            aria-label={t('home.searchPlaceholder')}
            aria-autocomplete="list"
            aria-expanded={searchState.isOpen}
            aria-controls="station-listbox"
            role="combobox"
          />
          {isLoading && (
            <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-rail-amber/60" />
          )}

          {/* Results dropdown — inside input wrapper to match input width */}
          <AnimatePresence>
            {searchState.isOpen && currentItems.length > 0 && (
              <motion.ul
                id="station-listbox"
                role="listbox"
                initial={{ opacity: 0, y: -6, scaleY: 0.97 }}
                animate={{ opacity: 1, y: 0, scaleY: 1 }}
                exit={{ opacity: 0, y: -6, scaleY: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{ transformOrigin: 'top' }}
                className="absolute left-0 right-0 z-50 mt-2 list-none overflow-hidden rounded-2xl bg-rail-surface shadow-2xl ring-1 ring-rail-border"
              >
                {isGpsMode && (
                  <li className="flex items-center gap-1.5 border-b border-rail-border px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-rail-cream/30">
                    <MapPin className="h-3 w-3" />
                    {t('home.nearestStation')}
                  </li>
                )}
                {currentItems.slice(0, 8).map((station, idx) => {
                  const hasDistance = 'distanciaKm' in station
                  return (
                    <li
                      key={station.id}
                      role="option"
                      aria-selected={idx === searchState.activeIndex}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition',
                        idx === searchState.activeIndex ? 'bg-rail-amber/10' : 'hover:bg-white/5 light:hover:bg-black/5',
                        idx !== 0 && 'border-t border-rail-border'
                      )}
                      onMouseEnter={() => dispatch({ type: 'SET_ACTIVE_INDEX', index: idx })}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelect(station)
                      }}
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-rail-amber/40" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-rail-cream">
                          {!isGpsMode ? (
                            <HighlightText text={station.name} query={query} />
                          ) : (
                            station.name
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {station.types.slice(0, 3).map((type) => (
                            <ServiceBadge key={type} type={type} />
                          ))}
                          {hasDistance && (
                            <span className="text-[11px] text-rail-cream/35">
                              {t('home.nearestStationDistance', {
                                km: (station as EstacionConDistancia).distanciaKm.toFixed(1),
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {/* GPS button with pulse animation while loading */}
        <motion.button
          onClick={handleGPS}
          disabled={gpsLoading}
          aria-label={t('home.useGPS')}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl px-4 transition',
            'bg-rail-amber text-rail-navy hover:bg-rail-amber/90 disabled:opacity-50'
          )}
          whileTap={{ scale: 0.93 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {gpsLoading ? (
              <motion.span
                key="loading"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [1, 1.35, 1], opacity: 1 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              >
                <MapPin className="h-5 w-5" />
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MapPin className="h-5 w-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* GPS error message */}
      <AnimatePresence>
        {isGpsMode && geoError && !gpsLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300 ring-1 ring-red-500/20">
              <span className="flex-1">
                {geoError === 'permission_denied'
                  ? t('home.gpsPermissionDenied')
                  : t('home.gpsError')}
              </span>
              <button
                onClick={handleGPS}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-rail-cream/50 transition hover:text-rail-cream"
              >
                <RotateCcw className="h-3 w-3" />
                {t('common.retry')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
