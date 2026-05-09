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
          onClick={reset}
          className="rounded-xl bg-rail-amber px-5 py-2.5 text-sm font-semibold text-rail-navy hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  )
}
