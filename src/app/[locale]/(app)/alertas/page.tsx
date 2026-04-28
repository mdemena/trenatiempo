'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BottomNav } from '@/components/layout/BottomNav'
import { Link } from '@/i18n/navigation'

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
    <div className="flex min-h-screen flex-col bg-[#0A1628] text-white">
      <main className="flex-1 px-4 pb-24 pt-6">
        <h1 className="mb-6 text-xl font-bold text-white">{t('title')}</h1>

        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : subs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul role="list" className="space-y-3" aria-label={t('mySubscriptions')}>
            {subs.map((sub) => (
              <li
                key={sub.id}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3"
              >
                <Bell className="h-4 w-4 shrink-0 text-[#F5A623]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {t('train', { id: sub.trip_code })}
                  </p>
                  <p className="text-xs text-white/40">
                    {new Date(sub.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <Link
                  href={`/viaje/${sub.trip_code}`}
                  className="mr-2 text-xs text-[#F5A623]/70 hover:text-[#F5A623]"
                >
                  {t('view')}
                </Link>
                <button
                  onClick={() => handleRemove(sub)}
                  disabled={removing === sub.id}
                  aria-label={t('unsubscribe')}
                  className="rounded-full p-1.5 text-white/30 transition hover:bg-white/10 hover:text-red-400 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

function EmptyState() {
  const t = useTranslations('alertas')
  return (
    <div className="flex flex-col items-center gap-4 pt-20 text-center">
      <BellOff className="h-12 w-12 text-white/20" aria-hidden />
      <div>
        <p className="text-sm font-medium text-white/60">{t('empty')}</p>
        <p className="mt-1 text-xs text-white/30">{t('emptyDescription')}</p>
      </div>
    </div>
  )
}
