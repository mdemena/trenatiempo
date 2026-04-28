'use client'

import { useLocale as useNextIntlLocale } from 'next-intl'
import { useLocale } from '@/hooks/useLocale'
import { cn } from '@/lib/utils'
import type { Locale } from '@/types/database'

const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'es', label: 'Castellano', flag: '🇪🇸' },
  { code: 'ca', label: 'Català', flag: '🏴' },
  { code: 'gl', label: 'Galego', flag: '🏴' },
  { code: 'eu', label: 'Euskera', flag: '🏴' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

export function LocaleSwitcher() {
  const currentLocale = useNextIntlLocale()
  const { changeLocale } = useLocale()

  return (
    <div role="radiogroup" aria-label="Idioma" className="grid grid-cols-2 gap-2">
      {LOCALES.map(({ code, label, flag }) => {
        const active = currentLocale === code
        return (
          <button
            key={code}
            role="radio"
            aria-checked={active}
            onClick={() => changeLocale(code)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition',
              active
                ? 'bg-rail-amber/15 font-medium text-rail-amber ring-1 ring-rail-amber/30'
                : 'bg-white/5 text-rail-cream/60 hover:bg-white/8 hover:text-rail-cream/80'
            )}
          >
            <span aria-hidden="true">{flag}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
