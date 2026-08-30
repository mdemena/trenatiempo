'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronLeft, Cookie, Settings2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/Switch'
import {
  readConsent,
  saveConsent,
  applyConsent,
  type ConsentChoice,
} from '@/lib/consent'
import {
  getSessionUser,
  fetchRemoteConsent,
  saveRemoteConsent,
} from '@/lib/supabase/consent'

type Status = 'loading' | 'show' | 'hide'

async function pushRemoteConsent(choice: ConsentChoice) {
  const user = await getSessionUser()
  if (user) await saveRemoteConsent(user.id, choice)
}

/** ¿Existe ya una elección (cookie o Supabase)? */
async function hasStoredConsent(): Promise<boolean> {
  const cookie = readConsent()
  if (cookie) {
    // Sincroniza silenciosamente con Supabase por si el usuario se acaba de loguear
    void (async () => {
      const user = await getSessionUser()
      if (!user) return
      const remote = await fetchRemoteConsent(user.id)
      if (remote !== cookie) await saveRemoteConsent(user.id, cookie)
    })().catch(() => {})
    return true
  }
  try {
    const user = await getSessionUser()
    if (user) {
      const remote = await fetchRemoteConsent(user.id)
      if (remote) {
        saveConsent(remote)
        applyConsent(remote)
        return true
      }
    }
  } catch {
    // Supabase no disponible → se muestra el banner
  }
  return false
}

export function CookieConsentBanner() {
  const t = useTranslations('cookies')
  const [status, setStatus] = useState<Status>('loading')
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    let active = true
    hasStoredConsent().then((hasConsent) => {
      if (active) setStatus(hasConsent ? 'hide' : 'show')
    })
    return () => {
      active = false
    }
  }, [])

  // Mientras el banner es bloqueante, impedir el scroll del fondo
  useEffect(() => {
    if (status !== 'show') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [status])

  function decide(choice: ConsentChoice) {
    saveConsent(choice)
    applyConsent(choice)
    void pushRemoteConsent(choice).catch(() => {})
    setStatus('hide')
  }

  function openPrefs() {
    setPrefsOpen(true)
    setAnalytics((readConsent() ?? 'essential') === 'analytics')
  }

  if (status !== 'show') return null

  const secondaryBtn =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-rail-surface px-4 py-2.5 text-sm font-medium text-rail-cream/70 ring-1 ring-rail-border transition hover:bg-white/5 light:hover:bg-black/5 active:scale-[0.98]'
  const primaryBtn =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-rail-amber px-4 py-2.5 text-sm font-semibold text-rail-navy transition hover:brightness-110 active:scale-[0.98]'

  return (
    <AnimatePresence>
      {status === 'show' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          {/* Backdrop bloqueante */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-rail-navy/80 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            className="relative my-auto w-full max-w-md overflow-hidden rounded-2xl border border-rail-border bg-rail-surface shadow-2xl shadow-black/50"
          >
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -top-16 -right-8 h-36 w-36 rounded-full bg-rail-amber/10 blur-3xl" />

            {/* Header */}
            <div className="relative flex items-start gap-3 p-5 pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rail-amber/10 ring-1 ring-rail-amber/20">
                <Cookie className="h-5 w-5 text-rail-amber" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="font-display text-base font-bold leading-tight text-rail-cream">
                  {t('title')}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-rail-cream/55">
                  {t('description')}
                </p>
              </div>
            </div>

            {/* Preferencias */}
            <AnimatePresence initial={false}>
              {prefsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 px-5 pb-2">
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-rail-surface px-3.5 py-3 ring-1 ring-rail-border">
                      <div className="flex min-w-0 items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-rail-green" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-rail-cream/80">
                            {t('necessary')}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-rail-cream/40">
                            {t('necessaryDescription')}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-rail-green/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rail-green">
                        {t('alwaysActive')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-xl bg-rail-surface px-3.5 py-3 ring-1 ring-rail-border">
                      <div className="flex min-w-0 items-start gap-3">
                        <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-rail-amber/70" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-rail-cream/80">
                            {t('analytics')}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-rail-cream/40">
                            {t('analyticsDescription')}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={analytics}
                        onChange={setAnalytics}
                        label={t('analytics')}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Acciones */}
            <div className="relative p-5 pt-3">
              {prefsOpen ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPrefsOpen(false)}
                    aria-label={t('back')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rail-surface text-rail-cream/60 ring-1 ring-rail-border transition hover:bg-white/5 light:hover:bg-black/5 active:scale-[0.98]"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(analytics ? 'analytics' : 'essential')}
                    className={cn(primaryBtn, 'flex-1')}
                  >
                    {t('saveAndClose')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => decide('essential')}
                      className={secondaryBtn}
                    >
                      {t('essential')}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide('analytics')}
                      className={primaryBtn}
                    >
                      {t('acceptAll')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={openPrefs}
                    className="mx-auto mt-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-rail-cream/45 transition hover:text-rail-amber"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {t('configure')}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}