'use client'

import { useSyncExternalStore } from 'react'
import { TrainFront, PanelLeftClose, PanelLeftOpen, LayoutGrid, Users, MapPin, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface AdminSidebarProps {
  adminName: string
}

interface SidebarItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/estaciones', label: 'Estaciones', icon: MapPin },
]

const STORAGE_KEY = 'admin_sidebar_collapsed'

function getSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

const LOCAL_EVENT = 'admin-sidebar-toggle'

function subscribe(onChange: () => void) {
  const handler = () => onChange()
  window.addEventListener(LOCAL_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(LOCAL_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function AdminSidebar({ adminName }: AdminSidebarProps) {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false // server snapshot
  )

  const toggle = () => {
    const next = !collapsed
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      window.dispatchEvent(new Event(LOCAL_EVENT))
    } catch {
      // almacenamiento no disponible
    }
  }

  return (
    <aside
      className={`relative hidden shrink-0 flex-col border-r border-rail-border bg-rail-surface/40 backdrop-blur transition-[width] duration-200 md:flex ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header: solo logo */}
      <div className="flex items-center justify-between border-b border-rail-border px-3 py-5">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rail-amber/15">
              <TrainFront className="h-4 w-4 text-rail-amber" />
            </span>
            <span className="rounded-full bg-rail-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rail-amber">
              Admin
            </span>
          </div>
        )}
        {collapsed && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rail-amber/15">
            <TrainFront className="h-4 w-4 text-rail-amber" />
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-rail-cream/40 transition hover:bg-rail-surface hover:text-rail-cream"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm text-rail-cream/60 transition hover:bg-rail-surface hover:text-rail-cream"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rail-amber/10 text-rail-amber transition group-hover:bg-rail-amber/15">
              <Icon className="h-4 w-4" />
            </span>
            {!collapsed && <span className="font-medium">{label}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer: admin user */}
      <div className={`border-t border-rail-border py-4 ${collapsed ? 'px-3 text-center' : 'px-5'}`}>
        <div
          className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}
          title={adminName}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rail-amber/15 text-xs font-bold text-rail-amber">
            {(adminName[0] ?? 'A').toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-rail-cream/80">{adminName}</p>
              <p className="mt-0.5 text-xs text-rail-amber/70">Administrador</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}