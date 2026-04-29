import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { ViajeClient } from '@/components/viaje/ViajeClient'
import { BottomNav } from '@/components/layout/BottomNav'
import { getRouteColors, routeShortName } from '@/lib/renfe/route-colors'

/** Extracts numeric train reference and line code from a GTFS tripId.
 *  e.g. "5116X15788R11" → { numTren: "15788", lineCode: "R11" } */
function parseTripId(tripId: string): { numTren: string | null; lineCode: string | null } {
  const match = tripId.match(/X(\d+)([A-Za-z0-9]+)$/)
  return { numTren: match?.[1] ?? null, lineCode: match?.[2] ?? null }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  const t = await getTranslations({ locale, namespace: 'viaje' })
  const { numTren } = parseTripId(id)
  return { title: `${t('title')} — ${numTren ?? id}` }
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

  const { numTren, lineCode } = parseTripId(id)
  const { bg: badgeBg, text: badgeText } = getRouteColors(lineCode ?? '')
  const shortLine = lineCode ? routeShortName(lineCode) : null

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

        {/* Line badge */}
        {shortLine && (
          <span
            className="shrink-0 inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-wide"
            style={{ backgroundColor: badgeBg, color: badgeText }}
          >
            {shortLine}
          </span>
        )}

        {/* Train reference */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-rail-cream/35">
            Tren
          </p>
          <p className="truncate font-display text-base font-bold leading-tight text-rail-cream">
            {numTren ?? id}
          </p>
        </div>
      </header>

      {/* Client section — hook + components */}
      <ViajeClient tripId={id} userStopId={stopId} />

      <BottomNav />
    </div>
  )
}
