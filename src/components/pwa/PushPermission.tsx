'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, BellOff, BellRing, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { Switch } from '@/components/ui/Switch'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

type Status = 'idle' | 'requesting' | 'subscribed' | 'denied'

interface PushPermissionProps {
  tripCode: string
  /** Identidad durable del tren (número + línea). La suscripción es al tren,
   *  no a la corrida del día, así que avisa todos los días que circule. */
  trainNumber?: string
  routeId?: string
  /** Estación a la que se refiere la alerta de llegada (id GTFS). */
  stationId?: string
  /** Nombre legible para el diálogo (opcional). */
  stationName?: string
  /** Fecha ISO de la corrida vista al suscribirse; informativa. */
  serviceDate?: string
  className?: string
}

export function PushPermission({
  tripCode,
  trainNumber,
  routeId,
  stationId,
  stationName,
  serviceDate,
  className,
}: PushPermissionProps) {
  const t = useTranslations('viaje')
  const router = useRouter()
  const user = useUserStore((s) => s.user)

  // `Notification` no existe en todos los contextos web (p.ej. WebKit/iOS
  // sin soporte push o en algunos modos privados). Acceder a él sin guardarlo
  // lanzaba un ReferenceError durante el render que tiraba toda la página de
  // estación al error boundary ("Error del servidor").
  const [status, setStatus] = useState<Status>(() => {
    if (
      typeof window !== 'undefined' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'denied'
    ) {
      return 'denied'
    }
    return 'idle'
  })
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notifyDelay, setNotifyDelay] = useState(true)
  const [notifyArrival, setNotifyArrival] = useState(true)
  const fetchedRef = useRef(false)

  // Check subscription server-side on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    if (!user || fetchedRef.current) return
    fetchedRef.current = true

    fetch('/api/push/subscriptions')
      .then((r) => (r.ok ? r.json() : []))
      .then((subs) => {
        const match = subs.find(
          (s: {
            trip_code: string | null
            train_number: string | null
            route_id: string | null
            endpoint: string
          }) =>
            (trainNumber && s.train_number === trainNumber && s.route_id === routeId) ||
            (!trainNumber && s.trip_code === tripCode)
        )
        if (match) {
          setEndpoint(match.endpoint)
          setStatus('subscribed')
          localStorage.setItem(`push_sub_${tripCode}`, match.endpoint)
        }
      })
      .catch((e) => console.error('Fetch subscriptions failed:', e))
  }, [tripCode, trainNumber, routeId, user])

  // Evita el scroll del fondo mientras el diálogo está abierto
  useEffect(() => {
    if (!dialogOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [dialogOpen])

  function openDialog() {
    setNotifyDelay(true)
    setNotifyArrival(Boolean(stationId))
    setDialogOpen(true)
  }

  async function handleUnsubscribe() {
    const ep = endpoint ?? localStorage.getItem(`push_sub_${tripCode}`)
    if (ep) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          trainNumber
            ? { endpoint: ep, trainNumber, routeId }
            : { endpoint: ep, tripCode }
        ),
      })
    }
    localStorage.removeItem(`push_sub_${tripCode}`)
    setEndpoint(null)
    setStatus('idle')
  }

  async function handleClick() {
    if (!user) {
      router.push(`/login?returnUrl=/viaje/${tripCode}`)
      return
    }
    if (status === 'subscribed') {
      await handleUnsubscribe()
      return
    }
    if (status === 'denied') return
    openDialog()
  }

  async function confirmSubscription() {
    if (!notifyDelay && !notifyArrival) return

    setDialogOpen(false)
    setStatus('requesting')

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }
      let swRegistration = await navigator.serviceWorker.getRegistration()
      if (!swRegistration) {
        try {
          swRegistration = await navigator.serviceWorker.register('/sw.js')
        } catch {
          setStatus('idle')
          return
        }
      }
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
        ).buffer as ArrayBuffer,
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          tripCode,
          trainNumber,
          routeId,
          ...(stationId ? { stationId } : {}),
          ...(serviceDate ? { serviceDate } : {}),
          notifyDelay,
          notifyArrival,
        }),
      })

      const ep = sub.endpoint
      localStorage.setItem(`push_sub_${tripCode}`, ep)
      setEndpoint(ep)
      setStatus('subscribed')
    } catch (err) {
      console.error('Push subscribe failed:', err)
      setStatus('idle')
    }
  }

  const isSubscribed = status === 'subscribed'
  const isDenied = status === 'denied'
  const isLoading = status === 'requesting'
  const canSave = notifyDelay || notifyArrival

  const secondaryBtn =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-rail-surface px-4 py-2.5 text-sm font-medium text-rail-cream/70 ring-1 ring-rail-border transition hover:bg-white/5 light:hover:bg-black/5 active:scale-[0.98]'
  const primaryBtn =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-rail-amber px-4 py-2.5 text-sm font-semibold text-rail-navy transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isLoading || isDenied}
        title={isDenied ? t('pushDenied') : isSubscribed ? t('unsubscribe') : t('subscribe')}
        aria-label={isDenied ? t('pushDenied') : isSubscribed ? t('unsubscribe') : t('subscribe')}
        aria-pressed={isSubscribed}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber disabled:cursor-not-allowed',
          isSubscribed
            ? 'hover:bg-rail-amber/10'
            : 'hover:bg-white/5',
          isDenied && 'opacity-30',
          className
        )}
      >
        {isLoading ? (
          <Spinner size="sm" variant="cream" />
        ) : isSubscribed ? (
          <BellRing className="h-4 w-4 text-rail-amber" />
        ) : isDenied ? (
          <BellOff className="h-4 w-4 text-rail-cream/30" />
        ) : (
          <Bell className="h-4 w-4 text-rail-cream/50" />
        )}
      </button>

      <AnimatePresence>
        {dialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto p-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            {/* Backdrop */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-rail-navy/80 backdrop-blur-sm"
              onClick={() => setDialogOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label={t('pushDialogTitle')}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-rail-border bg-rail-surface shadow-2xl shadow-black/50"
            >
              {/* Ambient glow */}
              <div className="pointer-events-none absolute -top-16 -right-8 h-36 w-36 rounded-full bg-rail-amber/10 blur-3xl" />

              {/* Header */}
              <div className="relative flex items-start gap-3 p-5 pb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rail-amber/10 ring-1 ring-rail-amber/20">
                  <BellRing className="h-5 w-5 text-rail-amber" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="font-display text-base font-bold leading-tight text-rail-cream">
                    {t('pushDialogTitle')}
                  </h2>
                  {stationId && stationName && (
                    <p className="mt-1 text-[13px] text-rail-cream/55">
                      {t('pushDialogStation', { station: stationName })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setDialogOpen(false)}
                  aria-label={t('pushCancel')}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
                >
                  <X className="h-4 w-4 text-rail-cream/50" />
                </button>
              </div>

              {/* Opciones */}
              <div className="relative space-y-2 px-5 pb-4">
                <div className="flex items-center justify-between gap-4 rounded-xl bg-rail-surface px-3.5 py-3 ring-1 ring-rail-border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rail-cream/80">
                      {t('pushNotifyDelay')}
                    </p>
                    <p className="text-[12px] leading-relaxed text-rail-cream/45">
                      {t('pushNotifyDelayDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={notifyDelay}
                    onChange={setNotifyDelay}
                    label={t('pushNotifyDelay')}
                  />
                </div>

                {stationId && (
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-rail-surface px-3.5 py-3 ring-1 ring-rail-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-rail-cream/80">
                        {t('pushNotifyArrival')}
                      </p>
                      <p className="text-[12px] leading-relaxed text-rail-cream/45">
                        {t('pushNotifyArrivalDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={notifyArrival}
                      onChange={setNotifyArrival}
                      label={t('pushNotifyArrival')}
                    />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="relative flex gap-2 border-t border-rail-border p-5 pt-4">
                <button onClick={() => setDialogOpen(false)} className={secondaryBtn}>
                  {t('pushCancel')}
                </button>
                <button
                  onClick={confirmSubscription}
                  disabled={!canSave}
                  className={cn(primaryBtn, 'flex-[1.4]')}
                >
                  {t('pushSave')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}