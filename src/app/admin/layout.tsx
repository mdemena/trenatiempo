import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { LayoutGrid, Users, MapPin } from 'lucide-react'
import Link from 'next/link'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import '../[locale]/globals.css'

// ─── Server-side admin verification (extra layer on top of middleware) ────────

async function getAdminUser() {
  const client = await createAdminClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return null

  const { data: profile } = await client
    .from('profiles')
    .select('full_name, email, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return profile
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/estaciones', label: 'Estaciones', icon: MapPin },
]

// ─── Layout ───────────────────────────────────────────────────────────────────

export const metadata = { title: { template: '%s | Admin · TrenATiempo', default: 'Admin · TrenATiempo' } }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const adminUser = await getAdminUser()
  if (!adminUser) redirect('/es/login?returnUrl=/admin')

  return (
    <ThemeProvider>
      <div className="relative flex min-h-dvh bg-rail-navy text-rail-cream">
        {/* Ambient glow */}
        <div className="pointer-events-none fixed -top-32 left-1/4 h-80 w-80 -translate-x-1/2 rounded-full bg-rail-amber/[0.07] blur-[120px]" />

        {/* Sidebar — desktop */}
        <AdminSidebar
          adminName={adminUser.full_name ?? adminUser.email ?? 'Admin'}
        />

      {/* Top nav — mobile */}
      <div className="flex w-full flex-col">
        <header className="flex items-center justify-between border-b border-rail-border bg-rail-surface/40 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-extrabold tracking-tight text-rail-cream">
              TrenATiempo
            </span>
            <span className="rounded-full bg-rail-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rail-amber">
              Admin
            </span>
          </div>
          <nav className="flex gap-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={label}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rail-cream/60 transition hover:bg-rail-surface hover:text-rail-cream"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </header>
        <main className="relative flex-1 p-4 md:p-6">{children}</main>
      </div>
      </div>
    </ThemeProvider>
  )
}
