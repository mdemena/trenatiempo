'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { z } from 'zod'
import { signInWithEmail } from '@/lib/supabase/auth-helpers'
import { cn } from '@/lib/utils'

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

type LoginFields = z.infer<typeof loginSchema>
type FieldErrors = Partial<Record<keyof LoginFields, string>>

// ─── Component ────────────────────────────────────────────────────────────────

interface LoginFormProps {
  returnUrl?: string
}

export function LoginForm({ returnUrl }: LoginFormProps) {
  const t = useTranslations('auth')
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)

    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      const errors: FieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginFields
        if (!errors[field]) errors[field] = issue.message
      }
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setLoading(true)

    try {
      await signInWithEmail(email, password)
      router.replace((returnUrl as Parameters<typeof router.replace>[0]) ?? '/')
    } catch {
      setServerError(t('loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
            autoComplete="current-password"
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
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErrors.password && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p>
        )}
      </div>

      {/* Forgot password slot */}
      <div className="text-right">
        <button
          type="button"
          disabled
          className="text-xs text-rail-cream/30 disabled:cursor-default"
        >
          {t('forgotPassword')}
        </button>
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
          t('login')
        )}
      </button>
    </form>
  )
}
