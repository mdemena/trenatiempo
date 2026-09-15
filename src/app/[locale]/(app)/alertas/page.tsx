'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { deviceLabel } from '@/lib/push/device'

interface Subscription {
  id: string
  trip_code: string
  train_number: string | null
  route_id: string | null
  endpoint: string
  /** Estación objetivo de la alerta de llegada (para reabrirlo en el viaje). */
  station_id: string | null
  /** Preferencias de aviso. Ambas en off = suscripción inactiva pero persistente. */
  notify_delay: boolean
  notify_arrival: boolean
  /** Navegador/dispositivo que registró la suscripción. */
  device_browser: string | null
  device_os: string | null
  device_model: string | null
  /** Fecha desde la que se suscribió (informativa). */
  service_date: string | null
  created_at: string
}

export default function AlertasPage() {
  const t = useTranslations('alertas')
  const tc = useTranslations('common')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  // Reintento: incrementarlo re-ejecuta el effect que carga las alertas.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false

    async function doLoad() {
      try {
        const res = await fetch('/api/push/subscriptions')
        if (!res.ok) throw new Error(`GET subscriptions → ${res.status}`)
        const data = await res.json() as Subscription[]
        if (!ignore) {
          setSubs(data)
          setError(false)
        }
      } catch {
        if (!ignore) setError(true)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    doLoad()
    return () => { ignore = true }
  }, [attempt])

  const retry = () => {
    setLoading(true)
    setError(false)
    setAttempt((a) => a + 1)
  }

  /** Actualiza una preferencia (notify_delay / notify_arrival) de forma
   *  optimista. La suscripción persiste aunque ambas queden en off — solo se
   *  pausa y puede reactivarse después. */
  async function handleToggle(sub: Subscription, field: 'notify_delay' | 'notify_arrival') {
    setToggling(sub.id)
    const previous = sub
    const next = { ...sub, [field]: !sub[field] }
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? next : s)))

    const body = JSON.stringify({
      endpoint: sub.endpoint,
      ...(sub.train_number
        ? { trainNumber: sub.train_number, routeId: sub.route_id }
        : { tripCode: sub.trip_code }),
      notifyDelay: next.notify_delay,
      notifyArrival: next.notify_arrival,
    })

    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) throw new Error(`PATCH subscribe → ${res.status}`)
    } catch {
      setSubs((prev) => prev.map((s) => (s.id === previous.id ? previous : s)))
    } finally {
      setToggling(null)
    }
  }

  async function handleRemove(sub: Subscription) {
    setRemoving(sub.id)
    // Optimistic update
    setSubs((prev) => prev.filter((s) => s.id !== sub.id))

    try {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // trainNumber+routeId identifican al tren (durable entre días); sin
        // ellos se cae a tripCode (compatibilidad con filas legacy).
        body: JSON.stringify(
          sub.train_number
            ? { endpoint: sub.endpoint, trainNumber: sub.train_number, routeId: sub.route_id }
            : { endpoint: sub.endpoint, tripCode: sub.trip_code }
        ),
      })
      localStorage.removeItem(`push_sub_${sub.trip_code}`)
    } catch {
      // Revert on failure
      setSubs((prev) => [...prev, sub].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-rail-navy">
      <main className="flex-1 px-4 pb-24 pt-6">
        <h1 className="mb-6 text-xl font-bold text-rail-cream">{t('title')}</h1>

        {loading ? (
          <div className="flex justify-center pt-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 pt-20 text-center">
            <p className="text-sm text-rail-cream/50">{t('loadError')}</p>
            <button
              onClick={retry}
              className="rounded-xl bg-white/8 px-4 py-2 text-sm text-rail-cream/70 transition hover:bg-white/12"
            >
              {tc('retry')}
            </button>
          </div>
        ) : subs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul role="list" className="space-y-3" aria-label={t('mySubscriptions')}>
            {subs.map((sub) => (
              <li
                key={sub.id}
                className="rounded-xl border border-rail-border bg-rail-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Bell
                    className="h-4 w-4 shrink-0 text-rail-amber"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-rail-cream">
                      {t('train', { id: sub.train_number ?? sub.trip_code })}
                    </p>
                    <p className="text-xs text-rail-cream/40">{t('everyDay')}</p>
                    <p className="mt-0.5 text-xs text-rail-cream/30">
                      {t('device', {
                        device:
                          deviceLabel({
                            browser: sub.device_browser,
                            os: sub.device_os,
                            model: sub.device_model,
                          }) ?? t('deviceUnknown'),
                      })}
                    </p>
                  </div>
                  <Link
                    href={tripHref(sub)}
                    className="mr-2 text-xs text-rail-amber/70 hover:text-rail-amber"
                  >
                    {t('view')}
                  </Link>
                  <button
                    onClick={() => handleRemove(sub)}
                    disabled={removing === sub.id || toggling === sub.id}
                    aria-label={t('unsubscribe')}
                    className="rounded-full p-1.5 text-rail-cream/30 transition hover:bg-white/10 hover:text-red-400 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-1">
                  <button
                    type="button"
                    aria-pressed={sub.notify_delay}
                    aria-label={t('toggleDelayAria', {
                      id: sub.train_number ?? sub.trip_code,
                    })}
                    onClick={() => handleToggle(sub, 'notify_delay')}
                    disabled={toggling === sub.id}
                    className={
                      'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:opacity-50 ' +
                      (sub.notify_delay
                        ? 'bg-rail-amber/15 text-rail-amber ring-rail-amber/30'
                        : 'bg-white/6 text-rail-cream/40 ring-white/10')
                    }
                  >
                    {sub.notify_delay ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                    {t('notifyDelay')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={sub.notify_arrival}
                    aria-label={t('toggleArrivalAria', {
                      id: sub.train_number ?? sub.trip_code,
                    })}
                    onClick={() => handleToggle(sub, 'notify_arrival')}
                    disabled={toggling === sub.id}
                    className={
                      'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:opacity-50 ' +
                      (sub.notify_arrival
                        ? 'bg-rail-amber/15 text-rail-amber ring-rail-amber/30'
                        : 'bg-white/6 text-rail-cream/40 ring-white/10')
                    }
                  >
                    {sub.notify_arrival ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                    {t('notifyArrival')}
                  </button>
                  {!sub.notify_delay && !sub.notify_arrival && (
                    <span className="text-xs text-rail-cream/30">
                      {t('notifyInactive')}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function tripHref(sub: Subscription): string {
  const params = new URLSearchParams()
  if (sub.station_id) params.set('stopId', sub.station_id)
  if (sub.service_date) params.set('fecha', sub.service_date)
  const qs = params.toString()
  return `/viaje/${sub.trip_code}${qs ? `?${qs}` : ''}`
}

function EmptyState() {
  const t = useTranslations('alertas')
  return (
    <div className="flex flex-col items-center gap-4 pt-20 text-center">
      <BellOff className="h-12 w-12 text-rail-cream/20" aria-hidden />
      <div>
        <p className="text-sm font-medium text-rail-cream/60">{t('empty')}</p>
        <p className="mt-1 text-xs text-rail-cream/30">{t('emptyDescription')}</p>
      </div>
    </div>
  )
}
