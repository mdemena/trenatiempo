import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'

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

export const metadata: Metadata = {
  title: 'TrenATiempo',
  description: 'Horarios de trenes Cercanías y Media Distancia en tiempo real',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${syne.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
