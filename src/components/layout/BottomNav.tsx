'use client'

import { useTranslations } from 'next-intl'
import { Home, Star, Bell, User } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'

const NAV_TABS = [
  { href: '/' as const, icon: Home, labelKey: 'home' as const },
  { href: '/favoritos' as const, icon: Star, labelKey: 'favorites' as const },
  { href: '/alertas' as const, icon: Bell, labelKey: 'alerts' as const },
] as const

export function BottomNav() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile } = useUserStore()

  const profileActive =
    pathname === '/perfil' || pathname.startsWith('/perfil/')

  const handleProfileTab = () => {
    if (user) {
      router.push('/perfil')
    } else {
      router.push('/login')
    }
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-rail-border bg-rail-navy/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-center">
        {NAV_TABS.map(({ href, icon: Icon, labelKey }) => {
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

        {/* Profile tab — session-aware */}
        <button
          onClick={handleProfileTab}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
            profileActive
              ? 'text-rail-amber'
              : 'text-rail-cream/40 hover:text-rail-cream/60'
          )}
        >
          {user && (profile?.avatar_url || profile?.full_name) ? (
            profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? ''}
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rail-amber/20 text-[10px] font-bold text-rail-amber">
                {profile.full_name?.[0]?.toUpperCase() ?? '?'}
              </span>
            )
          ) : (
            <User className="h-5 w-5" />
          )}
          {t('profile')}
        </button>
      </div>
    </nav>
  )
}
