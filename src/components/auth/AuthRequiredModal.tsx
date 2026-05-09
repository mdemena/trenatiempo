'use client'

import { useTranslations } from 'next-intl'
import * as Dialog from '@radix-ui/react-dialog'
import { X, LogIn, UserPlus } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { motion, AnimatePresence } from 'motion/react'

interface AuthRequiredModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
}

export function AuthRequiredModal({
  open,
  onOpenChange,
  title,
  description,
}: AuthRequiredModalProps) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-rail-surface p-6 ring-1 ring-rail-border focus:outline-none"
              >
                <div className="mb-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rail-amber/10">
                    <LogIn className="h-5 w-5 text-rail-amber" />
                  </div>

                  <Dialog.Title className="text-lg font-bold text-rail-cream">
                    {title ?? t('favorites.authRequired')}
                  </Dialog.Title>

                  {description && (
                    <Dialog.Description className="mt-1.5 text-sm text-rail-cream/45">
                      {description}
                    </Dialog.Description>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      onOpenChange(false)
                      router.push('/login')
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-rail-amber px-4 py-2.5 text-sm font-semibold text-rail-navy transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <LogIn className="h-4 w-4" />
                    {t('auth.login')}
                  </button>

                  <button
                    onClick={() => {
                      onOpenChange(false)
                      router.push('/registro')
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-rail-surface px-4 py-2.5 text-sm font-medium text-rail-cream/70 ring-1 ring-rail-border transition hover:bg-white/5 active:scale-[0.98]"
                  >
                    <UserPlus className="h-4 w-4" />
                    {t('auth.register')}
                  </button>

                  <Dialog.Close asChild>
                    <button
                      className="mt-1 w-full py-2 text-xs text-rail-cream/35 transition hover:text-rail-cream/60"
                    >
                      {t('common.cancel')}
                    </button>
                  </Dialog.Close>
                </div>

                <Dialog.Close asChild>
                  <button
                    className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/5"
                    aria-label={t('common.close')}
                  >
                    <X className="h-4 w-4 text-rail-cream/40" />
                  </button>
                </Dialog.Close>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
