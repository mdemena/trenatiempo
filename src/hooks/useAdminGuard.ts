'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type GuardStatus = 'checking' | 'allowed'

/**
 * Client-side guard for admin pages. Redirects to home if the current user
 * is not an admin. Shows a skeleton while verifying to prevent content flash.
 */
export function useAdminGuard(): { checking: boolean } {
  const [status, setStatus] = useState<GuardStatus>('checking')
  const router = useRouter()

  useEffect(() => {
    async function verify() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
        setStatus('allowed')
      } else {
        router.replace('/')
      }
    }

    verify()
  }, [router])

  return { checking: status === 'checking' }
}
