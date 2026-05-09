import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Revoca la sesión en Supabase y limpia cookies en el proceso (vía setAll)
  await supabase.auth.signOut()

  // Doble seguridad: barrer cualquier sb-* cookie residual
  for (const [name] of request.cookies) {
    if (name.startsWith('sb-')) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 })
    }
  }

  return response
}
