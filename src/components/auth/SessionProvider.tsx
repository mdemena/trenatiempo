'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { syncLocaleOnLogin } from '@/lib/supabase/auth-helpers'
import { useUserStore } from '@/store/userStore'
import { useLoadFavorites } from '@/hooks/useFavorites'

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setProfile, clearUser } = useUserStore()
  useLoadFavorites()

  useEffect(() => {
    const supabase = createClient()

    // Load initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => { if (data) setProfile(data) })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          if (profile) setProfile(profile)
          await syncLocaleOnLogin(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          clearUser()
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setProfile, clearUser])

  return <>{children}</>
}
