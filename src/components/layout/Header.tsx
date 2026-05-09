'use client'

import { useTranslations } from 'next-intl'
import { usePathname } from '@/i18n/navigation'
import { LogIn, TrainFront } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useUserStore } from '@/store/userStore'
import { ThemeToggle } from './ThemeToggle'

const AUTH_ROUTES = ['/login', '/registro']

export function Header() {
  const t = useTranslations()
  const pathname = usePathname()
  const { user } = useUserStore()

  const isAuthRoute = AUTH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/')
  )

  return (
    <header className="sticky top-0 z-40 border-b border-rail-border bg-rail-navy/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-rail-cream/80 transition hover:text-rail-cream"
        >
          <TrainFront className="h-4 w-4 text-rail-amber" />
          TrenATiempo
        </Link>

        <div className="flex items-center gap-1">
          <ThemeToggle />

          {!user && !isAuthRoute && (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-rail-amber transition hover:bg-rail-amber/10"
            >
              <LogIn className="h-3.5 w-3.5" />
              {t('auth.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
