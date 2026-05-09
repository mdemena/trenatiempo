import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { PerfilClient } from '@/components/perfil/PerfilClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'profile' })
  return { title: t('title') }
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const locale = await getLocale()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware covers this, but defensive redirect just in case
  if (!user) {
    redirect(`/${locale}/login?returnUrl=/${locale}/perfil`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-dvh flex-col bg-rail-navy">
      <PerfilClient user={user} profile={profile} />
    </div>
  )
}
