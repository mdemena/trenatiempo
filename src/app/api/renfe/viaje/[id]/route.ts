import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // TODO: implement trip detail with GTFS-RT
  return NextResponse.json({ tripId: id, paradas: [], posicion: null })
}
