'use client'

import { SerwistProvider as BaseSerwistProvider } from '@serwist/next/react'

export function SerwistProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <BaseSerwistProvider
      swUrl="/sw.js"
      reloadOnOnline={false}
    >
      {children}
    </BaseSerwistProvider>
  )
}
