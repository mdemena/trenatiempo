import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { HomeClient } from '@/components/estacion/HomeClient'
import { Zap, Navigation, Bell, WifiOff } from 'lucide-react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'home' })
  return { title: t('title') }
}

const featureIcons = [Zap, Navigation, Bell, WifiOff]

export default function HomePage() {
  const t = useTranslations('home')
  const features = [
    { title: t('features.realtime.title'), description: t('features.realtime.description') },
    { title: t('features.gps.title'), description: t('features.gps.description') },
    { title: t('features.alerts.title'), description: t('features.alerts.description') },
    { title: t('features.offline.title'), description: t('features.offline.description') },
  ]

  return (
    <main className="flex min-h-dvh flex-col">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-5 pb-10 pt-20 text-center sm:pt-28 md:pt-36">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-rail-amber/10 blur-[120px]" />

        <p className="mb-3 animate-[slide-up_0.5s_ease-out] font-display text-[11px] font-bold uppercase tracking-[0.3em] text-rail-amber">
          TrenATiempo
        </p>

        <h1 className="animate-[slide-up_0.6s_ease-out] font-display text-[2.4rem] font-extrabold leading-[1.08] tracking-tight text-rail-cream sm:text-5xl md:text-6xl">
          {t('title')}
        </h1>

        <p className="mx-auto mt-4 max-w-md animate-[slide-up_0.7s_ease-out] text-base leading-relaxed text-rail-cream/60 sm:text-lg">
          {t('subtitle')}
        </p>

        {/* Search bar — slides up after headline */}
        <div className="mt-8 w-full max-w-sm animate-[slide-up_0.8s_ease-out]">
          <p className="mb-3 text-left text-xs font-semibold uppercase tracking-widest text-rail-cream/35">
            {t('startSearching')}
          </p>
          <HomeClient />
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section className="px-5 pb-16 pt-10 sm:pb-24 sm:pt-14">
        <h2 className="mb-8 text-center font-display text-xl font-bold tracking-tight text-rail-cream sm:text-2xl">
          {t('features.title')}
        </h2>

        <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
          {features.map((feat, i) => {
            const Icon = featureIcons[i]
            return (
              <div
                key={feat.title}
                className="group rounded-2xl border border-rail-border bg-rail-surface/40 p-5 transition hover:border-rail-amber/20 hover:bg-rail-surface/60"
              >
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rail-amber/10 text-rail-amber transition group-hover:bg-rail-amber/15">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mb-1.5 font-display text-sm font-bold text-rail-cream">
                  {feat.title}
                </h3>
                <p className="text-sm leading-relaxed text-rail-cream/50">
                  {feat.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-rail-border px-5 py-6 text-center">
        <p className="text-xs text-rail-cream/25">
          {t('footer')}
        </p>
      </footer>
    </main>
  )
}
