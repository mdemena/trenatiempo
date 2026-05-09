'use client'

import { usePathname } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/types/database'

export function useLocale() {
  const pathname = usePathname()

  const changeLocale = async (newLocale: Locale) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`

    // Navegación completa para que el server component recargue los mensajes
    window.location.href = `/${newLocale}${pathname}`

    // En segundo plano, persistir preferencia en Supabase si el usuario está logueado
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ preferred_locale: newLocale })
          .eq('id', user.id)
      }
    } catch {
      // No crítico — el locale ya está en la cookie
    }
  }

  return { changeLocale }
}
