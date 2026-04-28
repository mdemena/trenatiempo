import { createAdminClient } from '@/lib/supabase/server'
import { UserTable } from '@/components/admin/UserTable'

export const metadata = { title: 'Usuarios' }

async function getCurrentAdminId(): Promise<string | null> {
  const client = await createAdminClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  return user?.id ?? null
}

export default async function AdminUsuariosPage() {
  const currentAdminId = await getCurrentAdminId()

  if (!currentAdminId) return null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <p className="mt-1 text-sm text-gray-500">Gestión de cuentas y roles</p>
      </div>

      <UserTable currentAdminId={currentAdminId} />
    </div>
  )
}
