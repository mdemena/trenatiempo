'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { TipoFiltro } from '@/hooks/useHorarios'

const TABS: { key: TipoFiltro; label: string }[] = [
  { key: 'all', label: 'filterAll' },
  { key: 'cercanias', label: 'filterCercanias' },
  { key: 'md', label: 'filterMD' },
]

interface FilterBarProps {
  value: TipoFiltro
  onChange: (v: TipoFiltro) => void
}

export function FilterBar({ value, onChange }: FilterBarProps) {
  const t = useTranslations('horarios')

  return (
    <div className="sticky top-0 z-30 bg-rail-navy/95 backdrop-blur-sm px-4 py-3">
      <div className="relative flex gap-1 rounded-xl bg-white/5 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative z-10 flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
              value === tab.key
                ? 'text-rail-navy'
                : 'text-rail-cream/50 hover:text-rail-cream/80'
            )}
          >
            {value === tab.key && (
              <motion.span
                layoutId="filter-pill"
                className="absolute inset-0 rounded-lg bg-rail-amber"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative">{t(tab.label)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
