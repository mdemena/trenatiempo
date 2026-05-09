'use client'

import { useTranslations } from 'next-intl'
import { useLocale as useNextIntlLocale } from 'next-intl'
import { usePathname } from '@/i18n/navigation'
import { ChevronDown, LogIn, TrainFront } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useUserStore } from '@/store/userStore'
import { useLocale } from '@/hooks/useLocale'
import { ThemeToggle } from './ThemeToggle'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

const AUTH_ROUTES = ['/login', '/registro']

const LOCALES = [
  { code: 'es' as const, label: 'Castellano', flag: 'es' },
  { code: 'ca' as const, label: 'Català', flag: 'es-ct' },
  { code: 'gl' as const, label: 'Galego', flag: 'es-ga' },
  { code: 'eu' as const, label: 'Euskera', flag: 'es-pv' },
  { code: 'en' as const, label: 'English', flag: 'gb' },
  { code: 'fr' as const, label: 'Français', flag: 'fr' },
]

function LocaleDropdown() {
  const currentLocale = useNextIntlLocale()
  const { changeLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const current = LOCALES.find((l) => l.code === currentLocale) ?? LOCALES[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 rounded-xl px-2 py-1.5 text-base transition hover:bg-white/8 light:hover:bg-black/8"
      >
        <span aria-hidden="true" className={`fi fi-${current.flag} rounded-sm`} />
        <ChevronDown className={cn('h-3 w-3 text-rail-cream/40 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-xl border border-rail-border bg-rail-navy py-1 shadow-xl backdrop-blur-md">
          {LOCALES.map(({ code, label, flag }) => {
            const active = code === currentLocale
            return (
              <button
                key={code}
                onClick={async () => {
                  await changeLocale(code)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition',
                  active
                    ? 'bg-rail-amber/10 font-semibold text-rail-amber'
                    : 'text-rail-cream/60 hover:bg-white/8 light:hover:bg-black/8 hover:text-rail-cream/80'
                )}
              >
                <span aria-hidden="true" className={`fi fi-${flag} rounded-sm text-lg`} />
                <span>{label}</span>
                {active && (
                  <span className="ml-auto text-[10px] text-rail-amber/50">✓</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
          <LocaleDropdown />
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
