import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { getStationById } from '@/lib/renfe/gtfs-static'
import { EstacionClient } from '@/components/estacion/EstacionClient'
import { FavoriteButton } from '@/components/favorites/FavoriteButton'

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
    <div className="flex h-dvh flex-col bg-rail-navy">
      {/* Fixed header — always visible */}
      <header className="flex shrink-0 items-center gap-3 border-b border-rail-border bg-rail-navy/95 px-4 py-3">
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

        <FavoriteButton type="station" id={station.id} name={station.name} />
      </header>

      {/* Client section: FilterBar + TrainList */}
      <EstacionClient stopId={station.id} />
    </div>
  )
}
