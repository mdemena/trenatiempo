import { createAdminClient } from '@/lib/supabase/server'
import { Users, Activity, TrendingUp, Database } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Dashboard' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalUsers: number
  activeUsers: number
  newUsersThisWeek: number
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
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [totalRes, activeRes, newRes, localeRes, cacheRes] = await Promise.all([
    client.from('profiles').select('id', { count: 'exact', head: true }),
    client.from('profiles').select('id', { count: 'exact', head: true }).gte('last_seen', thirtyDaysAgo),
    client.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    Promise.all(
      (['es', 'ca', 'gl', 'eu', 'en', 'fr'] as const).map((l) =>
        client.from('profiles').select('id', { count: 'exact', head: true }).eq('preferred_locale', l)
          .then(({ count }) => [l, count ?? 0] as const)
      )
    ),
    client.from('adif_cache').select('key, expires_at').order('expires_at', { ascending: false }).limit(1),
  ])

  return {
    totalUsers: totalRes.count ?? 0,
    activeUsers: activeRes.count ?? 0,
    newUsersThisWeek: newRes.count ?? 0,
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className="text-3xl font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Usuarios por idioma</h3>
      <div className="flex items-end gap-3" style={{ height: '120px' }}>
        {Object.entries(data).map(([locale, count]) => (
          <div key={locale} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-semibold tabular-nums text-gray-600">{count}</span>
            <div
              className="w-full rounded-t bg-indigo-400 transition-all"
              style={{ height: `${Math.round((count / max) * 80)}px`, minHeight: count > 0 ? '4px' : '0' }}
            />
            <span className="text-[10px] font-medium text-gray-400">{labels[locale]}</span>
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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Resumen general de TrenATiempo</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total usuarios"
          value={stats.totalUsers}
          icon={Users}
        />
        <KpiCard
          label="Activos (30 días)"
          value={stats.activeUsers}
          icon={Activity}
          sub={stats.totalUsers > 0 ? `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}%` : undefined}
        />
        <KpiCard
          label="Nuevos esta semana"
          value={stats.newUsersThisWeek}
          icon={TrendingUp}
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
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-700">Últimos registros</h3>
          <Link
            href="/admin/usuarios"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Ver todos →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400">
              <th className="px-5 py-2.5 text-left font-medium">Nombre / Email</th>
              <th className="px-5 py-2.5 text-left font-medium">Rol</th>
              <th className="px-5 py-2.5 text-left font-medium">Registro</th>
            </tr>
          </thead>
          <tbody>
            {recentUsers.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-800">{u.full_name ?? '–'}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      u.role === 'admin'
                        ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                        : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'
                    }
                  >
                    {u.role === 'admin' ? 'Admin' : 'Usuario'}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-gray-400">
                  {new Date(u.created_at).toLocaleDateString('es-ES')}
                </td>
              </tr>
            ))}
            {recentUsers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-gray-400">
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
