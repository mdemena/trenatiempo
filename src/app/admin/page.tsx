import { createAdminClient } from '@/lib/supabase/server'
import { Users, Activity, UserCheck, Database } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Dashboard' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  regularUsers: number
  totalUsers: number
  activeUsers: number
  usersByLocale: Record<string, number>
  cacheStatus: { entries: number; expiresAt: string | null }
}

type RecentUser = {
  id: string
  full_name: string | null
  email: string | null
  role: 'user' | 'admin'
  created_at: string
}

// ─── Data fetching (directly from Supabase, no API roundtrip for RSC) ─────────

async function fetchStats(): Promise<Stats> {
  const client = await createAdminClient()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [regularRes, totalRes, activeRes, localeRes, cacheRes] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
    client.from('profiles').select('id', { count: 'exact', head: true }),
    client.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen', thirtyDaysAgo),
    Promise.all(
      (['es', 'ca', 'gl', 'eu', 'en', 'fr'] as const).map((l) =>
        client.from('profiles').select('id', { count: 'exact', head: true }).eq('preferred_locale', l)
          .then(({ count }) => [l, count ?? 0] as const)
      )
    ),
    client.from('adif_cache').select('key, expires_at').order('expires_at', { ascending: false }).limit(1),
  ])

  return {
    regularUsers: regularRes.count ?? 0,
    totalUsers: totalRes.count ?? 0,
    activeUsers: activeRes.count ?? 0,
    usersByLocale: Object.fromEntries(localeRes),
    cacheStatus: {
      entries: cacheRes.data?.length ?? 0,
      expiresAt: cacheRes.data?.[0]?.expires_at ?? null,
    },
  }
}

async function fetchRecentUsers(): Promise<RecentUser[]> {
  const client = await createAdminClient()
  const { data } = await client
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []) as RecentUser[]
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-rail-border bg-rail-surface/40 p-5 transition hover:border-rail-amber/20">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-rail-cream/60">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rail-amber/10 text-rail-amber">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="font-display text-3xl font-bold tabular-nums text-rail-cream">{value}</p>
      {sub && <p className="mt-1 text-xs text-rail-cream/40">{sub}</p>}
    </div>
  )
}

// ─── Locale bar chart ─────────────────────────────────────────────────────────

function LocaleChart({ data }: { data: Record<string, number> }) {
  const max = Math.max(...Object.values(data), 1)
  const labels: Record<string, string> = {
    es: 'ES', ca: 'CA', gl: 'GL', eu: 'EU', en: 'EN', fr: 'FR',
  }
  return (
    <div className="rounded-2xl border border-rail-border bg-rail-surface/40 p-5">
      <h3 className="font-display mb-4 text-sm font-bold text-rail-cream">Usuarios por idioma</h3>
      <div className="flex items-end gap-3" style={{ height: '120px' }}>
        {Object.entries(data).map(([locale, count]) => (
          <div key={locale} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-semibold tabular-nums text-rail-cream/60">{count}</span>
            <div
              className="w-full rounded-t bg-rail-amber/70 transition-all"
              style={{ height: `${Math.round((count / max) * 80)}px`, minHeight: count > 0 ? '4px' : '0' }}
            />
            <span className="text-[10px] font-medium text-rail-cream/40">{labels[locale]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const [stats, recentUsers] = await Promise.all([fetchStats(), fetchRecentUsers()])

  const cacheOk = stats.cacheStatus.entries > 0
  const cacheAge = stats.cacheStatus.expiresAt
    ? Math.round((new Date().getTime() - new Date(stats.cacheStatus.expiresAt).getTime()) / 60_000)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-rail-cream">Dashboard</h1>
        <p className="mt-1 text-sm text-rail-cream/50">Resumen de la app desde el backoffice</p>
      </div>

      {/* Headline metric: registered users that are NOT admin */}
      <div className="relative overflow-hidden rounded-2xl border border-rail-border bg-rail-surface/40 p-6 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rail-amber/10 blur-[80px]" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rail-amber text-rail-navy">
            <UserCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-rail-cream/60">Usuarios registrados</p>
            <p className="font-display text-4xl font-extrabold tabular-nums text-rail-cream">{stats.regularUsers}</p>
          </div>
        </div>
        <p className="relative mt-4 border-t border-rail-border pt-3 text-xs text-rail-cream/40">
          Solamente cuentas de usuario (rol «usuario»). Los administradores quedan excluidos.
        </p>
      </div>

      {/* Secondary KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard
          label="Total cuentas"
          value={stats.totalUsers}
          icon={Users}
          sub={stats.totalUsers > 0 ? `${stats.regularUsers} usuarios + ${stats.totalUsers - stats.regularUsers} admin` : undefined}
        />
        <KpiCard
          label="Activos (30 días)"
          value={stats.activeUsers}
          icon={Activity}
          sub={stats.totalUsers > 0 ? `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}%` : undefined}
        />
        <KpiCard
          label="Caché Renfe"
          value={cacheOk ? `${stats.cacheStatus.entries} entradas` : '—'}
          icon={Database}
          sub={
            cacheOk && cacheAge !== null
              ? cacheAge <= 0
                ? 'OK · vigente'
                : `Expiró hace ${Math.abs(cacheAge)} min`
              : '⚠️ Sin datos'
          }
        />
      </div>

      {/* Locale chart */}
      <LocaleChart data={stats.usersByLocale} />

      {/* Recent users */}
      <div className="overflow-hidden rounded-2xl border border-rail-border bg-rail-surface/40">
        <div className="flex items-center justify-between border-b border-rail-border px-5 py-4">
          <h3 className="font-display text-sm font-bold text-rail-cream">Últimos registros</h3>
          <Link
            href="/admin/usuarios"
            className="text-xs font-medium text-rail-amber hover:text-rail-amber/80"
          >
            Ver todos →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rail-border text-xs text-rail-cream/40">
              <th className="px-5 py-2.5 text-left font-medium">Nombre / Email</th>
              <th className="px-5 py-2.5 text-left font-medium">Rol</th>
              <th className="px-5 py-2.5 text-left font-medium">Registro</th>
            </tr>
          </thead>
          <tbody>
            {recentUsers.map((u) => (
              <tr key={u.id} className="border-b border-rail-border/60 last:border-0 hover:bg-rail-surface/60">
                <td className="px-5 py-3">
                  <p className="font-medium text-rail-cream">{u.full_name ?? '–'}</p>
                  <p className="text-xs text-rail-cream/40">{u.email}</p>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      u.role === 'admin'
                        ? 'rounded-full bg-rail-green/15 px-2 py-0.5 text-xs font-medium text-rail-green'
                        : 'rounded-full bg-rail-surface px-2 py-0.5 text-xs font-medium text-rail-cream/60'
                    }
                  >
                    {u.role === 'admin' ? 'Admin' : 'Usuario'}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-rail-cream/40">
                  {new Date(u.created_at).toLocaleDateString('es-ES')}
                </td>
              </tr>
            ))}
            {recentUsers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-rail-cream/40">
                  Sin usuarios
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
