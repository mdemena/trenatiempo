import { StationDetail } from '@/components/admin/StationDetail'

export const metadata = { title: 'Detalle de estación' }

export default async function AdminEstacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <StationDetail stationId={id} />
}