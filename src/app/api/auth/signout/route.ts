import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createAdminClient()
  await supabase.auth.signOut()

  const response = NextResponse.json({ ok: true })

  // Clear all Supabase auth cookies by reading them from the request
  for (const [name] of request.cookies) {
    if (name.startsWith('sb-')) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 })
    }
  }

  return response
}
