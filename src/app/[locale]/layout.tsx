import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { Syne, DM_Sans } from 'next/font/google'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SessionProvider } from '@/components/auth/SessionProvider'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { LayoutShell } from '@/components/layout/LayoutShell'
import { GoogleTagManager } from '@/components/analytics/GoogleTagManager'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

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

  return (
    <html lang={locale} className={`${syne.variable} ${dmSans.variable}`}>
      <body>
        <GoogleTagManager />
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <ThemeProvider>
              <LayoutShell>
                {children}
              </LayoutShell>
            </ThemeProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
