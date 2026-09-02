'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, XCircle, X } from 'lucide-react'

export interface ToastMessage {
  id: string
  type: 'success' | 'error'
  text: string
}

interface AdminToastProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export function AdminToast({ toasts, onDismiss }: AdminToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(id)
  }, [toast.id, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, x: 32, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 32, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex min-w-64 items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${
        toast.type === 'success'
          ? 'border-rail-green/30 bg-rail-surface text-rail-green'
          : 'border-red-500/30 bg-rail-surface text-red-400'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-rail-green" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
      )}
      <span className="flex-1 text-sm font-medium text-rail-cream">{toast.text}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-1 text-rail-cream/50 transition hover:text-rail-cream"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
