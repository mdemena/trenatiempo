'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  // Un error de hidratación/servidor suele deberse a un Service Worker obsoleto
  // que sirve HTML/chunks de un build anterior. Fuerza una carga limpia:
  // desregistra el SW y vacía su caché antes de recargar.
  async function hardReload() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch {
      // si falla la limpieza seguimos con la recarga normal
    }
    location.reload()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-rail-navy px-6 text-center">
      <AlertTriangle className="h-12 w-12 text-rail-amber/60" aria-hidden />
      <div>
        <p className="text-base font-semibold text-rail-cream">{t('serverError')}</p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-rail-cream/30">{error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="rounded-xl border border-rail-border px-5 py-2.5 text-sm text-rail-cream/60 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber"
        >
          {t('goBack')}
        </button>
        <button
          onClick={() => {
            reset()
            void hardReload()
          }}
          className="rounded-xl bg-rail-amber px-5 py-2.5 text-sm font-semibold text-rail-navy hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  )
}

