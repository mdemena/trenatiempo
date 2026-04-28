import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  // TODO: implement station search/nearest
  return NextResponse.json({ estaciones: [], q, lat, lng })
}
