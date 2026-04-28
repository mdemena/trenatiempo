import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const returnUrl = searchParams.get('returnUrl') ?? `/${locale}`

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Sync preferred_locale cookie from Supabase profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferred_locale')
        .eq('id', data.user.id)
        .single()

      const redirectUrl = new URL(returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`, origin)
      const response = NextResponse.redirect(redirectUrl)

      if (profile?.preferred_locale) {
        response.cookies.set('NEXT_LOCALE', profile.preferred_locale, {
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
          sameSite: 'lax',
        })
      }

      return response
    }
  }

  // Exchange failed — redirect to login with error hint
  return NextResponse.redirect(new URL(`/${locale}/login?error=auth`, origin))
}
