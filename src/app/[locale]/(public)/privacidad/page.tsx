import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CalendarDays, Database, Cookie, ShieldCheck } from 'lucide-react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'legal' })
  return { title: t('title') }
}

export default async function PrivacidadPage() {
  const t = await getTranslations('legal')

  const cookies = [
    {
      name: t('c1Name'),
      purpose: t('c1Purpose'),
      type: t('cookiesNecessary'),
      duration: t('c1Duration'),
    },
    {
      name: t('c2Name'),
      purpose: t('c2Purpose'),
      type: t('cookiesNecessary'),
      duration: t('c2Duration'),
    },
    {
      name: t('c3Name'),
      purpose: t('c3Purpose'),
      type: t('cookiesNecessary'),
      duration: t('c3Duration'),
    },
    {
      name: t('c4Name'),
      purpose: t('c4Purpose'),
      type: t('cookiesAnalytics'),
      duration: t('c4Duration'),
    },
    {
      name: t('c5Name'),
      purpose: t('c5Purpose'),
      type: t('cookiesAnalytics'),
      duration: t('c5Duration'),
    },
  ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-rail-amber/70">
          <CalendarDays className="h-3.5 w-3.5" />
          {t('updated')}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-rail-cream">
          {t('title')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-rail-cream/60">{t('intro')}</p>
      </header>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-rail-cream">
          <Database className="h-4 w-4 text-rail-amber" />
          {t('responsibleTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-rail-cream/60">{t('responsibleText')}</p>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-rail-cream">
          <ShieldCheck className="h-4 w-4 text-rail-amber" />
          {t('dataTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-rail-cream/60">{t('dataText')}</p>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-rail-cream">
          <Cookie className="h-4 w-4 text-rail-amber" />
          {t('cookiesTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-rail-cream/60">{t('cookiesIntro')}</p>

        <div className="mt-4 overflow-hidden rounded-2xl bg-rail-surface ring-1 ring-rail-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-rail-cream/30">
                  <th className="p-3 font-semibold">{t('cookieName')}</th>
                  <th className="p-3 font-semibold">{t('cookiePurpose')}</th>
                  <th className="p-3 font-semibold">{t('cookieType')}</th>
                  <th className="p-3 font-semibold">{t('cookieDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {cookies.map((c) => (
                  <tr key={c.name} className="border-t border-rail-border align-top">
                    <td className="whitespace-nowrap p-3 font-mono text-[11px] text-rail-amber/90">
                      {c.name}
                    </td>
                    <td className="p-3 text-rail-cream/60">{c.purpose}</td>
                    <td className="whitespace-nowrap p-3 text-rail-cream/45">{c.type}</td>
                    <td className="whitespace-nowrap p-3 text-rail-cream/45">{c.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-rail-cream/40">{t('storageNote')}</p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-rail-cream">{t('rightsTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-rail-cream/60">{t('rightsText')}</p>
      </section>
    </div>
  )
}