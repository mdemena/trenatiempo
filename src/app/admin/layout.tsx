import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { LayoutGrid, Users } from 'lucide-react'
import Link from 'next/link'

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
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      {/* Sidebar — desktop */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <span className="font-bold text-gray-900">TrenATiempo</span>
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
            Admin
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">
            {adminUser.full_name ?? adminUser.email ?? 'Admin'}
          </p>
          <p className="text-[11px] text-gray-400">Administrador</p>
        </div>
      </aside>

      {/* Top nav — mobile */}
      <div className="flex w-full flex-col md:hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">TrenATiempo</span>
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              Admin
            </span>
          </div>
          <nav className="flex gap-3">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={label}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 transition hover:bg-gray-100"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>

      {/* Main content — desktop */}
      <main className="hidden flex-1 overflow-y-auto p-6 md:block">{children}</main>
    </div>
  )
}
