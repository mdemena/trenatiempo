'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, AlertTriangle } from 'lucide-react'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface UserEditModalProps {
  user: Profile
  currentAdminId: string
  open: boolean
  onClose: () => void
  onSaved: (updated: Profile) => void
}

export function UserEditModal({
  user,
  currentAdminId,
  open,
  onClose,
  onSaved,
}: UserEditModalProps) {
  const [role, setRole] = useState<'user' | 'admin'>(user.role)
  const [active, setActive] = useState(user.active)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSelf = user.id === currentAdminId
  const promotingToAdmin = role === 'admin' && user.role !== 'admin'
  const deactivating = !active && user.active

  const handleSave = async () => {
    setError(null)
    setLoading(true)

    const body: Record<string, unknown> = { userId: user.id }
    if (role !== user.role) body.role = role
    if (active !== user.active) body.active = active

    if (Object.keys(body).length === 1) {
      // No changes
      onClose()
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al guardar')
        return
      }
      onSaved(json.usuario as Profile)
      onClose()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  const initials = (user.full_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rail-border bg-rail-surface p-6 shadow-xl focus:outline-none"
          aria-describedby="user-edit-desc"
        >
          <div className="mb-5 flex items-start justify-between">
            <Dialog.Title className="font-display text-base font-extrabold text-rail-cream">
              Editar usuario
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-lg p-1 text-rail-cream/50 transition hover:bg-rail-surface hover:text-rail-cream">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <p id="user-edit-desc" className="sr-only">
            Cambiar rol y estado del usuario {user.full_name ?? user.email}
          </p>

          {/* User info */}
          <div className="mb-5 flex items-center gap-3">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={user.full_name ?? ''}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rail-amber/15 text-sm font-bold text-rail-amber">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-rail-cream">
                {user.full_name ?? '–'}
              </p>
              <p className="truncate text-xs text-rail-cream/40">{user.email}</p>
              <p className="text-xs text-rail-cream/40">
                Registro: {new Date(user.created_at).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>

          {/* Role */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold text-rail-cream/60">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
              disabled={isSelf}
              className="w-full rounded-xl border border-rail-border bg-rail-navy px-3 py-2 text-sm text-rail-cream focus:border-rail-amber/40 focus:outline-none focus:ring-2 focus:ring-rail-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="user" className="bg-rail-navy">Usuario</option>
              <option value="admin" className="bg-rail-navy">Administrador</option>
            </select>
            {isSelf && (
              <p className="mt-1 text-xs text-rail-cream/40">No puedes cambiar tu propio rol</p>
            )}
            {promotingToAdmin && !isSelf && (
              <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-rail-amber/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rail-amber" />
                <p className="text-xs text-rail-amber/90">
                  Este usuario tendrá acceso completo al panel de administración
                </p>
              </div>
            )}
          </div>

          {/* Active toggle */}
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-semibold text-rail-cream/60">Estado</label>
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              disabled={isSelf}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-rail-green/30 bg-rail-green/10 text-rail-green'
                  : 'border-rail-border bg-rail-navy text-rail-cream/50'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${active ? 'bg-rail-green' : 'bg-rail-cream/30'}`}
              />
              {active ? 'Activo' : 'Inactivo'}
            </button>
            {isSelf && (
              <p className="mt-1 text-xs text-rail-cream/40">No puedes desactivar tu propia cuenta</p>
            )}
            {deactivating && !isSelf && (
              <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-red-500/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <p className="text-xs text-red-400">
                  El usuario perderá acceso a la app inmediatamente
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-rail-border py-2.5 text-sm text-rail-cream/60 transition hover:bg-rail-navy hover:text-rail-cream"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex flex-1 items-center justify-center rounded-xl bg-rail-amber py-2.5 text-sm font-bold text-rail-navy transition hover:bg-rail-amber/90 disabled:opacity-50"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-rail-navy/30 border-t-rail-navy" />
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
