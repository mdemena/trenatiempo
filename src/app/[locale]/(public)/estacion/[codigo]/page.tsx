import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStationById, getMaxScheduleDate } from '@/lib/renfe/gtfs-static'
import { EstacionClient } from '@/components/estacion/EstacionClient'

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
  const [station, maxScheduleDate] = await Promise.all([
    getStationById(codigo),
    getMaxScheduleDate(),
  ])
  if (!station) notFound()

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-rail-navy">
      {/* Client section: header + DatePicker + FilterBar + TrainList */}
      <Suspense fallback={null}>
        <EstacionClient station={station} maxFecha={maxScheduleDate} />
      </Suspense>
    </div>
  )
}
