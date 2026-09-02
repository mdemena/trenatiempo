'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download, Pencil } from 'lucide-react'
import type { Database } from '@/types/database'
import { UserEditModal } from './UserEditModal'
import { AdminToast, type ToastMessage } from './AdminToast'

type Profile = Database['public']['Tables']['profiles']['Row']

// ─── Helpers ─────────────────────────────────────────────────────────────────

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Nunca'
  const diffMs = new Date(dateStr).getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60_000)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)
  if (Math.abs(diffDay) >= 1) return rtf.format(diffDay, 'day')
  if (Math.abs(diffHour) >= 1) return rtf.format(diffHour, 'hour')
  return rtf.format(diffMin, 'minute')
}

function exportCsv(users: Profile[]) {
  const headers = ['Nombre', 'Email', 'Rol', 'Idioma', 'Estado', 'Último acceso', 'Registro']
  const rows = users.map((u) => [
    u.full_name ?? '',
    u.email ?? '',
    u.role,
    u.preferred_locale,
    u.active ? 'Activo' : 'Inactivo',
    u.last_seen ?? '',
    u.created_at,
  ])
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface UserTableProps {
  currentAdminId: string
}

export function UserTable({ currentAdminId }: UserTableProps) {
  const [users, setUsers] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [loading, setLoading] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const addToast = (type: ToastMessage['type'], text: string) => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, type, text }])
  }

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const fetchUsers = useCallback(
    async (params: { page: number; search: string; role: string; status: string }) => {
      setLoading(true)
      try {
        const q = new URLSearchParams({
          page: String(params.page),
          search: params.search,
          role: params.role,
          status: params.status,
        })
        const res = await fetch(`/api/admin/usuarios?${q}`)
        if (!res.ok) throw new Error('Error fetching users')
        const json = await res.json()
        setUsers(json.usuarios)
        setTotal(json.total)
        setTotalPages(json.totalPages)
      } catch {
        addToast('error', 'Error al cargar usuarios')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Debounce search/filter/page changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchUsers({ page, search, role: roleFilter, status: statusFilter })
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [page, search, roleFilter, statusFilter, fetchUsers])

  const handleSaved = useCallback((updated: Profile) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    addToast('success', 'Usuario actualizado correctamente')
  }, [])

  return (
    <>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream placeholder:text-rail-cream/30 focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        />

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        >
          <option value="all" className="bg-rail-navy">Todos los roles</option>
          <option value="user" className="bg-rail-navy">Usuario</option>
          <option value="admin" className="bg-rail-navy">Admin</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-xl border border-rail-border bg-rail-surface/40 px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20"
        >
          <option value="all" className="bg-rail-navy">Todos los estados</option>
          <option value="active" className="bg-rail-navy">Activos</option>
          <option value="inactive" className="bg-rail-navy">Inactivos</option>
        </select>

        <button
          onClick={() => exportCsv(users)}
          disabled={users.length === 0}
          className="flex items-center gap-1.5 rounded-xl border border-rail-border px-3 py-2 text-sm text-rail-cream/70 transition hover:border-rail-amber/30 hover:text-rail-cream disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* Table wrapper */}
      <div className="overflow-x-auto rounded-2xl border border-rail-border bg-rail-surface/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rail-border text-xs font-medium uppercase tracking-widest text-rail-cream/40">
              <th className="px-4 py-3 text-left">Nombre / Email</th>
              <th className="hidden px-4 py-3 text-left md:table-cell">Rol</th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">Idioma</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="hidden px-4 py-3 text-left xl:table-cell">Último acceso</th>
              <th className="hidden px-4 py-3 text-left xl:table-cell">Registro</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-rail-border border-t-rail-amber" />
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-rail-cream/40">
                  Sin resultados
                </td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-rail-border/60 last:border-0 hover:bg-rail-surface/60"
                >
                  {/* Name / email */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar_url}
                          alt={user.full_name ?? ''}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rail-amber/15 text-xs font-bold text-rail-amber">
                          {(user.full_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-rail-cream">
                          {user.full_name ?? '–'}
                        </p>
                        <p
                          className={`truncate text-xs ${
                            user.active ? 'text-rail-cream/40' : 'text-rail-cream/25 line-through'
                          }`}
                        >
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Role badge */}
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span
                      className={
                        user.role === 'admin'
                          ? 'rounded-full bg-rail-green/15 px-2 py-0.5 text-xs font-medium text-rail-green'
                          : 'rounded-full bg-rail-surface px-2 py-0.5 text-xs font-medium text-rail-cream/60'
                      }
                    >
                      {user.role === 'admin' ? 'Admin' : 'Usuario'}
                    </span>
                  </td>

                  {/* Locale */}
                  <td className="hidden px-4 py-3 text-xs text-rail-cream/40 lg:table-cell">
                    {user.preferred_locale.toUpperCase()}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          user.active ? 'bg-rail-green' : 'bg-red-400'
                        }`}
                      />
                      <span className="text-xs text-rail-cream/50">
                        {user.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </td>

                  {/* Last seen */}
                  <td className="hidden px-4 py-3 text-xs text-rail-cream/40 xl:table-cell">
                    {formatRelative(user.last_seen)}
                  </td>

                  {/* Created at */}
                  <td className="hidden px-4 py-3 text-xs text-rail-cream/40 xl:table-cell">
                    {new Date(user.created_at).toLocaleDateString('es-ES')}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rail-border px-2.5 py-1.5 text-xs text-rail-cream/70 transition hover:border-rail-amber/30 hover:text-rail-cream"
                      aria-label={`Editar ${user.full_name ?? user.email}`}
                    >
                      <Pencil className="h-3 w-3" />
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-rail-cream/50">
          <p>
            {total} usuarios · página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-rail-border p-1.5 transition hover:bg-rail-surface disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page - 2 + i
              if (p < 1 || p > totalPages) return null
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[32px] rounded-lg border px-2 py-1.5 text-xs transition ${
                    p === page
                      ? 'border-rail-amber/40 bg-rail-amber/15 font-semibold text-rail-amber'
                      : 'border-rail-border hover:bg-rail-surface'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-rail-border p-1.5 transition hover:bg-rail-surface disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          currentAdminId={currentAdminId}
          open={!!editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Toast notifications */}
      <AdminToast toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
