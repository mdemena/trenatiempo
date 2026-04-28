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
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#0A1628] px-6 text-center">
      <AlertTriangle className="h-12 w-12 text-[#F5A623]/60" aria-hidden />
      <div>
        <p className="text-base font-semibold text-white">{t('serverError')}</p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-white/30">{error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-white/60 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]"
        >
          {t('goBack')}
        </button>
        <button
          onClick={reset}
          className="rounded-xl bg-[#F5A623] px-5 py-2.5 text-sm font-semibold text-[#0A1628] hover:bg-[#f5b84a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  )
}
