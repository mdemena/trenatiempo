'use client'

import { useTranslations } from 'next-intl'
import { Home, Star, Bell, User } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/' as const, icon: Home, labelKey: 'home' as const },
  { href: '/favoritos' as const, icon: Star, labelKey: 'favorites' as const },
  { href: '/alertas' as const, icon: Bell, labelKey: 'alerts' as const },
  { href: '/perfil' as const, icon: User, labelKey: 'profile' as const },
]

export function BottomNav() {
  const t = useTranslations('nav')
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/8 bg-rail-navy/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-center">
        {TABS.map(({ href, icon: Icon, labelKey }) => {
          const active =
            pathname === href ||
            (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                active
                  ? 'text-rail-amber'
                  : 'text-rail-cream/40 hover:text-rail-cream/60'
              )}
            >
              <Icon className="h-5 w-5" />
              {t(labelKey)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
