'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Shield } from 'lucide-react'

export function Footer() {
  const t = useTranslations('footer')

  return (
    <footer className="mt-10 border-t border-rail-border px-4 pb-6 pt-6 text-center">
      <p className="text-xs text-rail-cream/35">
        {t.rich('copyright', {
          link: (chunks) => (
            <a
              href="https://www.sctechsolutions.es"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rail-amber/80 underline decoration-rail-amber/30 underline-offset-2 transition hover:text-rail-amber"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
      <Link
        href="/privacidad"
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-rail-cream/55 transition hover:text-rail-amber"
      >
        <Shield className="h-3.5 w-3.5" />
        {t('privacy')}
      </Link>
    </footer>
  )
}