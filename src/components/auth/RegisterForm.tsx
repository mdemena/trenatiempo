'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { z } from 'zod'
import { signUpWithEmail } from '@/lib/supabase/auth-helpers'
import { cn } from '@/lib/utils'

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  })

type RegisterFields = { fullName: string; email: string; password: string; confirmPassword: string }
type FieldErrors = Partial<Record<keyof RegisterFields, string>>

// ─── Email-sent confirmation screen ──────────────────────────────────────────

function EmailConfirmScreen({ email }: { email: string }) {
  const t = useTranslations('auth')
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rail-amber/15">
        <MailCheck className="h-8 w-8 text-rail-amber" />
      </div>
      <div>
        <p className="font-display text-lg font-bold text-rail-cream">{t('emailConfirmTitle')}</p>
        <p className="mt-1 text-sm text-rail-cream/50">
          {t('emailConfirmDescription', { email })}
        </p>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RegisterForm() {
  const t = useTranslations('auth')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  if (registered) return <EmailConfirmScreen email={email} />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)

    const result = registerSchema.safeParse({ fullName, email, password, confirmPassword })
    if (!result.success) {
      const errors: FieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof RegisterFields
        if (!errors[field]) errors[field] = issue.message
      }
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setLoading(true)

    try {
      await signUpWithEmail(email, password, fullName)
      setRegistered(true)
    } catch {
      setServerError(t('registerError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Full name */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-rail-cream/50">
          {t('fullName')}
        </label>
        <input
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={cn(
            'w-full rounded-2xl bg-white/6 px-4 py-3 text-sm text-rail-cream placeholder:text-rail-cream/25 outline-none transition focus:bg-white/8 focus:ring-1',
            fieldErrors.fullName ? 'ring-1 ring-red-400/60' : 'focus:ring-white/15'
          )}
        />
        {fieldErrors.fullName && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.fullName}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-rail-cream/50">
          {t('email')}
        </label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(
            'w-full rounded-2xl bg-white/6 px-4 py-3 text-sm text-rail-cream placeholder:text-rail-cream/25 outline-none transition focus:bg-white/8 focus:ring-1',
            fieldErrors.email ? 'ring-1 ring-red-400/60' : 'focus:ring-white/15'
          )}
        />
        {fieldErrors.email && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-rail-cream/50">
          {t('password')}
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(
              'w-full rounded-2xl bg-white/6 px-4 py-3 pr-11 text-sm text-rail-cream placeholder:text-rail-cream/25 outline-none transition focus:bg-white/8 focus:ring-1',
              fieldErrors.password ? 'ring-1 ring-red-400/60' : 'focus:ring-white/15'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-rail-cream/30 hover:text-rail-cream/60 transition"
            aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErrors.password && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p>
        )}
      </div>

      {/* Confirm password */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-rail-cream/50">
          {t('confirmPassword')}
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={cn(
              'w-full rounded-2xl bg-white/6 px-4 py-3 pr-11 text-sm text-rail-cream placeholder:text-rail-cream/25 outline-none transition focus:bg-white/8 focus:ring-1',
              fieldErrors.confirmPassword ? 'ring-1 ring-red-400/60' : 'focus:ring-white/15'
            )}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-rail-cream/30 hover:text-rail-cream/60 transition"
            aria-label={showConfirm ? 'Ocultar' : 'Mostrar'}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErrors.confirmPassword && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.confirmPassword}</p>
        )}
      </div>

      {/* Server error */}
      {serverError && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {serverError}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-2xl bg-rail-amber px-4 py-3 text-sm font-semibold text-rail-navy transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-rail-navy/30 border-t-rail-navy/80" />
        ) : (
          t('register')
        )}
      </button>
    </form>
  )
}
