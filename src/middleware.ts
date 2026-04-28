import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { updateSession } from '@/lib/supabase/middleware'

const intlMiddleware = createMiddleware(routing)

// Rutas que requieren autenticación
const APP_ROUTES = ['/favoritos', '/perfil']
// Rutas que requieren rol admin
const ADMIN_ROUTES = ['/admin']

function matchesLocaleRoute(pathname: string, routes: string[]): boolean {
  // pathname tiene formato /{locale}/{ruta}
  return routes.some((route) =>
    new RegExp(`^/[a-z]{2}${route}(/.*)?$`).test(pathname)
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Aplicar next-intl primero (detección y redirección de locale)
  const intlResponse = intlMiddleware(request)

  // Si next-intl redirige (e.g., /es → /), respetar la redirección
  if (intlResponse.status !== 200) {
    return intlResponse
  }

  // Rutas de API quedan fuera del flujo de auth de locale
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const requiresAuth = matchesLocaleRoute(pathname, APP_ROUTES)
  const requiresAdmin = matchesLocaleRoute(pathname, ADMIN_ROUTES)

  if (!requiresAuth && !requiresAdmin) {
    return intlResponse
  }

  // Verificar sesión
  const { user, supabase, supabaseResponse } = await updateSession(request)

  // Extraer locale de la URL (/{locale}/...)
  const localeSegment = pathname.split('/')[1] ?? 'es'

  if (!user) {
    return NextResponse.redirect(
      new URL(`/${localeSegment}/login`, request.url)
    )
  }

  if (requiresAdmin) {
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
  // Excluir ficheros estáticos, _next, y api
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
