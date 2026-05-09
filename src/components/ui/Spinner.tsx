'use client'

import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'amber' | 'cream' | 'navy'
  className?: string
}

const sizes = {
  sm: { outer: 'h-4 w-4', hub: 'h-[5px] w-[5px]' },
  md: { outer: 'h-6 w-6', hub: 'h-2 w-2' },
  lg: { outer: 'h-10 w-10', hub: 'h-3 w-3' },
  xl: { outer: 'h-14 w-14', hub: 'h-4 w-4' },
}

const variantColors = {
  amber: {
    base: 'rgba(245, 166, 35, 0.08)',
    top: '#F5A623',
    right: 'rgba(245, 166, 35, 0.3)',
    spoke: 'bg-rail-amber/8',
    hubRing: 'ring-rail-amber/20',
  },
  cream: {
    base: 'rgba(248, 246, 242, 0.15)',
    top: '#F8F6F2',
    right: 'rgba(248, 246, 242, 0.35)',
    spoke: 'bg-rail-cream/8',
    hubRing: 'ring-rail-cream/20',
  },
  navy: {
    base: 'rgba(10, 22, 40, 0.15)',
    top: '#0A1628',
    right: 'rgba(10, 22, 40, 0.35)',
    spoke: 'bg-rail-navy/8',
    hubRing: 'ring-rail-navy/20',
  },
}

export function Spinner({ size = 'md', variant = 'amber', className }: SpinnerProps) {
  const s = sizes[size]
  const c = variantColors[variant]

  return (
    <div className={cn('relative flex items-center justify-center', s.outer, className)}>
      <div
        className="absolute inset-0 animate-spin rounded-full border-2"
        style={{
          borderColor: c.base,
          borderTopColor: c.top,
          borderRightColor: c.right,
        }}
      />
      <div
        className="absolute inset-[2px] animate-spin rounded-full"
        style={{ animationDuration: '3s' }}
      >
        <div className={cn('absolute left-1/2 top-0 h-full w-px -translate-x-1/2', c.spoke)} />
        <div className={cn('absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45', c.spoke)} />
        <div className={cn('absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-90', c.spoke)} />
        <div className={cn('absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-[135deg]', c.spoke)} />
      </div>
      <div className={cn('rounded-full bg-rail-navy', c.hubRing, s.hub)} />
    </div>
  )
}
