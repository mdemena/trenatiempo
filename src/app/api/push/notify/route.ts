import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  // TODO: verify admin role + send push via web-push
  void body
  return NextResponse.json({ ok: true })
}
