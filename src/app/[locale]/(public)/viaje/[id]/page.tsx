import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { ViajeClient } from '@/components/viaje/ViajeClient'
import { BottomNav } from '@/components/layout/BottomNav'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  const t = await getTranslations({ locale, namespace: 'viaje' })
  return { title: `${t('title')} — ${id}` }
}

export default async function ViajePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{ stopId?: string }>
}) {
  const { id } = await params
  const { stopId } = await searchParams

  return (
    <div className="flex min-h-dvh flex-col bg-rail-navy pb-20">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/5 bg-rail-navy/95 px-4 py-3 backdrop-blur-sm">
        <Link
          href={stopId ? `/estacion/${stopId}` : '/'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5 text-rail-cream/70" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-rail-amber/60">
            TrenATiempo
          </p>
          <p className="truncate font-display text-base font-bold text-rail-cream">
            {id}
          </p>
        </div>
      </header>

      {/* Client section — hook + components */}
      <ViajeClient tripId={id} userStopId={stopId} />

      <BottomNav />
    </div>
  )
}
