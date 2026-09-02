import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTimeZone } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SessionProvider } from '@/components/auth/SessionProvider'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { LayoutShell } from '@/components/layout/LayoutShell'
import { GoogleTagManager } from '@/components/analytics/GoogleTagManager'
import { SerwistProvider } from '@/components/pwa/SerwistProvider'
import './globals.css'
import 'flag-icons/css/flag-icons.min.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const viewport: Viewport = {
  themeColor: '#0A1628',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    template: '%s | TrenATiempo',
    default: 'TrenATiempo — Trenes en tiempo real',
  },
  description: 'Horarios de Cercanías y Media Distancia de Renfe en tiempo real',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TrenATiempo',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  const messages = await getMessages()
  const timeZone = await getTimeZone()

  return (
    <>
      <GoogleTagManager />
      <SerwistProvider>
        <NextIntlClientProvider key={locale} locale={locale} messages={messages} timeZone={timeZone}>
          <SessionProvider>
            <ThemeProvider>
              <LayoutShell>
                {children}
              </LayoutShell>
            </ThemeProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </SerwistProvider>
    </>
  )
}
