'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

type Status = 'idle' | 'requesting' | 'subscribed' | 'denied'

interface PushPermissionProps {
  tripCode: string
  className?: string
}

export function PushPermission({ tripCode, className }: PushPermissionProps) {
  const t = useTranslations('viaje')
  const router = useRouter()
  const user = useUserStore((s) => s.user)

  const [status, setStatus] = useState<Status>('idle')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  // Check subscription server-side on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }

    if (!user || fetchedRef.current) return
    fetchedRef.current = true

    fetch('/api/push/subscriptions')
      .then((r) => (r.ok ? r.json() : []))
      .then((subs) => {
        const match = subs.find(
          (s: { trip_code: string; endpoint: string }) => s.trip_code === tripCode
        )
        if (match) {
          setEndpoint(match.endpoint)
          setStatus('subscribed')
          localStorage.setItem(`push_sub_${tripCode}`, match.endpoint)
        }
      })
      .catch((e) => console.error('Fetch subscriptions failed:', e))
  }, [tripCode, user])

  async function handleToggle() {
    if (!user) {
      router.push(`/login?returnUrl=/viaje/${tripCode}`)
      return
    }

    if (status === 'subscribed') {
      // Unsubscribe using endpoint from state or localStorage
      const ep = endpoint ?? localStorage.getItem(`push_sub_${tripCode}`)
      if (ep) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: ep }),
        })
      }
      localStorage.removeItem(`push_sub_${tripCode}`)
      setStatus('idle')
      setEndpoint(null)
      return
    }

    if (status === 'denied') return

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
        body: JSON.stringify({ subscription: sub.toJSON(), tripCode }),
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

  return (
    <button
      onClick={handleToggle}
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
  )
}
