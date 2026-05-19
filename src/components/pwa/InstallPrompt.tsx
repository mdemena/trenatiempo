'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { X, Share } from 'lucide-react'
import { useTranslations } from 'next-intl'

const DISMISSED_KEY = 'pwa_install_dismissed_until'
const DISMISS_DAYS = 7

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const t = useTranslations('pwa')
  const shouldReduce = useReducedMotion()

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showAndroid, setShowAndroid] = useState(false)
  const [showIOS, setShowIOS] = useState(() => {
    if (typeof window === 'undefined') return false
    if (isInStandaloneMode()) return false
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY)
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return false
    return isIOS()
  })

  useEffect(() => {
    if (isInStandaloneMode()) return

    const dismissedUntil = localStorage.getItem(DISMISSED_KEY)
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowAndroid(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISSED_KEY, String(until))
    setShowAndroid(false)
    setShowIOS(false)
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowAndroid(false)
    }
    setDeferredPrompt(null)
  }

  const slideProps = shouldReduce
    ? {}
    : {
        initial: { y: 80, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: 80, opacity: 0 },
        transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
      }

  return (
    <AnimatePresence>
      {/* Android / Chrome */}
      {showAndroid && (
        <motion.div
          key="android-prompt"
          {...slideProps}
          className="fixed inset-x-0 bottom-0 z-50 pb-safe"
        >
          <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-[#0d1f38] p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="TrenATiempo" className="h-12 w-12 rounded-xl" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{t('installPrompt')}</p>
                <p className="mt-0.5 text-xs text-white/50">{t('installDescription')}</p>
              </div>
              <button
                onClick={dismiss}
                aria-label={t('notNow')}
                className="shrink-0 rounded-full p-1 text-white/40 hover:text-white/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={dismiss}
                className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/60 hover:bg-white/5"
              >
                {t('notNow')}
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 rounded-xl bg-rail-amber py-2 text-sm font-semibold text-rail-navy hover:brightness-110"
              >
                {t('install')}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* iOS Safari */}
      {showIOS && (
        <motion.div
          key="ios-prompt"
          {...slideProps}
          className="fixed inset-x-0 bottom-0 z-50 pb-safe"
        >
          <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-[#0d1f38] p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <p className="text-sm font-semibold text-white">{t('installPrompt')}</p>
              <button
                onClick={dismiss}
                aria-label={t('notNow')}
                className="rounded-full p-1 text-white/40 hover:text-white/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="flex items-center gap-2 text-xs text-white/50">
              <span>{t('iosInstall')}</span>
              <Share className="h-3.5 w-3.5 shrink-0 text-rail-amber" aria-hidden />
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
