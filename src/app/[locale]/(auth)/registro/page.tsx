import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { Train } from 'lucide-react'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { GoogleButton, OrSeparator } from '@/components/auth/GoogleButton'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'auth' })
  return { title: t('register') }
}

export default async function RegistroPage() {
  const t = await getTranslations('auth')

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0A1628] px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rail-amber/15">
            <Train className="h-7 w-7 text-rail-amber" />
          </div>
          <div className="text-center">
            <p className="font-display text-xl font-bold text-rail-cream">TrenATiempo</p>
            <p className="mt-0.5 text-sm text-rail-cream/40">{t('register')}</p>
          </div>
        </div>

        {/* Google */}
        <div className="space-y-4">
          <GoogleButton />
          <OrSeparator />
        </div>

        {/* Register form */}
        <RegisterForm />

        {/* Footer link */}
        <p className="text-center text-sm text-rail-cream/40">
          {t('hasAccount')}{' '}
          <Link
            href="/login"
            className="font-medium text-rail-amber/80 transition hover:text-rail-amber"
          >
            {t('login')}
          </Link>
        </p>
      </div>
    </div>
  )
}
