import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, Star } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { getStationById } from '@/lib/renfe/gtfs-static'
import { EstacionClient } from '@/components/estacion/EstacionClient'
import { BottomNav } from '@/components/layout/BottomNav'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; codigo: string }>
}): Promise<Metadata> {
  const { locale, codigo } = await params
  const station = await getStationById(codigo)
  const t = await getTranslations({ locale, namespace: 'horarios' })
  return {
    title: station ? `${station.name} — ${t('title')}` : t('title'),
  }
}

export default async function EstacionPage({
  params,
}: {
  params: Promise<{ locale: string; codigo: string }>
}) {
  const { codigo } = await params
  const station = await getStationById(codigo)
  if (!station) notFound()

  return (
    <div className="flex min-h-dvh flex-col bg-rail-navy pb-20">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/5 bg-rail-navy/95 px-4 py-3 backdrop-blur-sm">
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5 text-rail-cream/70" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-rail-amber/60">
            TrenATiempo
          </p>
          <h1 className="truncate font-display text-lg font-bold text-rail-cream">
            {station.name}
          </h1>
        </div>

        {/* Favorite slot — no functionality yet */}
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/5"
          aria-label="Añadir a favoritos"
          disabled
        >
          <Star className="h-5 w-5 text-rail-cream/25" />
        </button>
      </header>

      {/* Client section: FilterBar + TrainList */}
      <EstacionClient stopId={station.id} />

      <BottomNav />
    </div>
  )
}
