import { StationTable } from '@/components/admin/StationTable'

export const metadata = { title: 'Estaciones' }

export default function AdminEstacionesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-rail-cream">
          Estaciones
        </h1>
        <p className="mt-1 text-sm text-rail-cream/50">
          Catálogo de estaciones con filtros por provincia y localidad
        </p>
      </div>

      <StationTable />
    </div>
  )
}