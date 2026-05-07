import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'TrenATiempo',
  description: 'Horarios de trenes Cercanías y Media Distancia en tiempo real',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  redirect('/es')
}
