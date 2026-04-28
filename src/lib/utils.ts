import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDelay(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60)
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(
    -minutes,
    'minute'
  )
}

export function formatTime(unixTimestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixTimestamp * 1000))
}
