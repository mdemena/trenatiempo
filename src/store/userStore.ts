import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface UserState {
  user: User | null
  profile: Profile | null
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  clearUser: () => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  clearUser: () => set({ user: null, profile: null }),
}))
