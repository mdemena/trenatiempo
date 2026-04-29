import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'

const intlMiddleware = createMiddleware(routing)

// Rutas que requieren autenticación
const APP_ROUTES = ['/favoritos', '/perfil']
// Rutas que requieren rol admin
const ADMIN_ROUTES = ['/admin']
// Rutas de auth (redirigir si ya hay sesión)
const AUTH_ROUTES = ['/login', '/registro']

function matchesLocaleRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) =>
    new RegExp(`^/[a-z]{2}${route}(/.*)?$`).test(pathname)
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Las rutas de API no necesitan auth ni locale
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Rutas /admin/* están fuera del locale routing — guardarlas directamente
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    try {
      const { user, supabase } = await updateSession(request)

      if (!user) {
        return NextResponse.redirect(new URL('/es/login?returnUrl=' + pathname, request.url))
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (data?.role !== 'admin') {
        return NextResponse.redirect(new URL('/es', request.url))
      }

      return NextResponse.next()
    } catch {
      // Si Supabase falla (env vars, red), redirigir a login por seguridad
      return NextResponse.redirect(new URL('/es/login?returnUrl=' + pathname, request.url))
    }
  }

  // Aplicar next-intl primero (detección y redirección de locale)
  const intlResponse = intlMiddleware(request)

  // Si next-intl redirige (e.g., /es → /), respetar la redirección
  if (intlResponse.status !== 200) {
    return intlResponse
  }

  const requiresAuth = matchesLocaleRoute(pathname, APP_ROUTES)
  const requiresAdmin = matchesLocaleRoute(pathname, ADMIN_ROUTES)
  const isAuthRoute = matchesLocaleRoute(pathname, AUTH_ROUTES)

  // Rutas públicas que no necesitan verificar sesión
  if (!requiresAuth && !requiresAdmin && !isAuthRoute) {
    return intlResponse
  }

  const localeSegment = pathname.split('/')[1] ?? 'es'
  const { user, supabase, supabaseResponse } = await updateSession(request)

  // Usuario ya autenticado intenta acceder a login/registro → redirigir a home
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL(`/${localeSegment}`, request.url))
  }

  // Rutas protegidas sin sesión → redirigir a login con returnUrl
  if ((requiresAuth || requiresAdmin) && !user) {
    const loginUrl = new URL(`/${localeSegment}/login`, request.url)
    loginUrl.searchParams.set('returnUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Rutas de admin: verificar rol
  if (requiresAdmin && user) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (data?.role !== 'admin') {
      return NextResponse.redirect(new URL(`/${localeSegment}`, request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
