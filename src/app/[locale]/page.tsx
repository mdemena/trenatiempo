import { useTranslations } from 'next-intl'

export default function HomePage() {
  const t = useTranslations('home')

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6">
      <h1 className="font-display text-4xl font-bold text-rail-amber">
        TrenATiempo
      </h1>
      <p className="mt-2 text-rail-cream/70">{t('title')}</p>
    </main>
  )
}
