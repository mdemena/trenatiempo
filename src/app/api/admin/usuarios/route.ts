import { NextResponse } from 'next/server'

export async function GET() {
  // TODO: verify admin role + return paginated users
  return NextResponse.json({ usuarios: [], total: 0 })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  // TODO: verify admin role + update user role/status
  void body
  return NextResponse.json({ ok: true })
}
