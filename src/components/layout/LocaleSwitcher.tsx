'use client'

import { useLocale as useNextIntlLocale } from 'next-intl'
import { useLocale } from '@/hooks/useLocale'
import { cn } from '@/lib/utils'
import type { Locale } from '@/types/database'

const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'es', label: 'Castellano', flag: 'es' },
  { code: 'ca', label: 'Català', flag: 'es-ct' },
  { code: 'gl', label: 'Galego', flag: 'es-ga' },
  { code: 'eu', label: 'Euskera', flag: 'es-pv' },
  { code: 'en', label: 'English', flag: 'gb' },
  { code: 'fr', label: 'Français', flag: 'fr' },
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
            onClick={async () => { await changeLocale(code) }}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition',
              active
                ? 'bg-rail-amber/15 font-medium text-rail-amber ring-1 ring-rail-amber/30'
                : 'bg-rail-surface text-rail-cream/60 hover:bg-white/8 light:hover:bg-black/8 hover:text-rail-cream/80'
            )}
          >
            <span aria-hidden="true" className={`fi fi-${flag} rounded-sm`} />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
