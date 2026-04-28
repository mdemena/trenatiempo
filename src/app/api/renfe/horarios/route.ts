import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stopId = searchParams.get('stopId')
  const tipo = searchParams.get('tipo') as 'cercanias' | 'md' | null

  // TODO: implement combined GTFS + GTFS-RT horarios
  return NextResponse.json({ horarios: [], updatedAt: Date.now(), stopId, tipo })
}
