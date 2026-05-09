'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Spinner } from '@/components/ui/Spinner'

interface Subscription {
  id: string
  trip_code: string
  endpoint: string
  created_at: string
}

export default function AlertasPage() {
  const t = useTranslations('alertas')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const fetchSubs = useCallback(async () => {
    try {
      const res = await fetch('/api/push/subscriptions')
      if (res.ok) setSubs(await res.json())
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubs()
  }, [fetchSubs])

  async function handleRemove(sub: Subscription) {
    setRemoving(sub.id)
    // Optimistic update
    setSubs((prev) => prev.filter((s) => s.id !== sub.id))

    try {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
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
        ) : subs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul role="list" className="space-y-3" aria-label={t('mySubscriptions')}>
            {subs.map((sub) => (
              <li
                key={sub.id}
                className="flex items-center gap-3 rounded-xl border border-rail-border bg-rail-surface px-4 py-3"
              >
                <Bell className="h-4 w-4 shrink-0 text-rail-amber" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-rail-cream">
                    {t('train', { id: sub.trip_code })}
                  </p>
                  <p className="text-xs text-rail-cream/40">
                    {new Date(sub.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <Link
                  href={`/viaje/${sub.trip_code}`}
                  className="mr-2 text-xs text-rail-amber/70 hover:text-rail-amber"
                >
                  {t('view')}
                </Link>
                <button
                  onClick={() => handleRemove(sub)}
                  disabled={removing === sub.id}
                  aria-label={t('unsubscribe')}
                  className="rounded-full p-1.5 text-rail-cream/30 transition hover:bg-white/10 hover:text-red-400 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-amber"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
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
