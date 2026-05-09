'use client'

import { useUserStore } from '@/store/userStore'
import { usePathname } from '@/i18n/navigation'
import { Header } from './Header'
import { BottomNav } from './BottomNav'

const AUTH_PAGES = ['/login', '/registro']

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { user } = useUserStore()
  const pathname = usePathname()

  const isAuthPage = AUTH_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  const showBottomNav = !!user && !isAuthPage

  return (
    <>
      <Header />
      <div className={showBottomNav ? 'pb-20' : ''}>{children}</div>
      {showBottomNav && <BottomNav />}
    </>
  )
}
