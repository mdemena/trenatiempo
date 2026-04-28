import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  // TODO: validate auth + save subscription to Supabase
  void body
  return NextResponse.json({ ok: true })
}
