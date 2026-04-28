import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { HomeClient } from '@/components/estacion/HomeClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'home' })
  return { title: t('title') }
}

export default function HomePage() {
  const t = useTranslations('home')

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        {/* Header — CSS animation so it works in RSC */}
        <header className="mb-8 animate-[slide-up_0.5s_ease-out] text-center">
          <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.25em] text-rail-amber">
            TrenATiempo
          </p>
          <h1 className="font-display text-[2rem] font-bold leading-tight text-rail-cream">
            {t('title')}
          </h1>
        </header>

        {/* Interactive client section: StationSearch + recent stations */}
        <HomeClient />
      </div>
    </main>
  )
}
