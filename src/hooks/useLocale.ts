'use client'

import { useRouter, usePathname } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/types/database'

export function useLocale() {
  const router = useRouter()
  const pathname = usePathname()

  const changeLocale = async (newLocale: Locale) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      await supabase
        .from('profiles')
        .update({ preferred_locale: newLocale })
        .eq('id', user.id)
    }

    router.replace(pathname, { locale: newLocale })
  }

  return { changeLocale }
}
