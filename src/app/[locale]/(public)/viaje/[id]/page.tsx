import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { ViajeClient } from '@/components/viaje/ViajeClient'

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

  return (
    <div className="flex h-dvh flex-col bg-rail-navy">
      <ViajeClient tripId={id} userStopId={stopId} />
    </div>
  )
}
