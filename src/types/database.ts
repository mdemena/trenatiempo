// Auto-generado con: supabase gen types typescript --local > src/types/database.ts
// Definido manualmente hasta que Supabase esté configurado localmente

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Locale = 'es' | 'ca' | 'gl' | 'eu' | 'en' | 'fr'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          role: 'user' | 'admin'
          active: boolean
          preferred_locale: Locale
          last_seen: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          role?: 'user' | 'admin'
          active?: boolean
          preferred_locale?: Locale
          last_seen?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          role?: 'user' | 'admin'
          active?: boolean
          preferred_locale?: Locale
          last_seen?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stations: {
        Row: {
          id: string
          name: string
          short_name: string | null
          lat: number | null
          lng: number | null
          province: string | null
          region: string | null
          types: string[]
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          short_name?: string | null
          lat?: number | null
          lng?: number | null
          province?: string | null
          region?: string | null
          types?: string[]
          active?: boolean
        }
        Update: {
          name?: string
          short_name?: string | null
          lat?: number | null
          lng?: number | null
          province?: string | null
          region?: string | null
          types?: string[]
          active?: boolean
        }
        Relationships: []
      }
      favorite_stations: {
        Row: {
          id: string
          user_id: string
          station_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          station_id: string
        }
        Update: {
          user_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'favorite_stations_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'favorite_stations_station_id_fkey'
            columns: ['station_id']
            referencedRelation: 'stations'
            referencedColumns: ['id']
          }
        ]
      }
      favorite_trips: {
        Row: {
          id: string
          user_id: string
          trip_code: string
          line_name: string | null
          origin_id: string | null
          dest_id: string | null
          schedule: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          trip_code: string
          line_name?: string | null
          origin_id?: string | null
          dest_id?: string | null
          schedule?: string | null
        }
        Update: {
          trip_code?: string
          line_name?: string | null
          origin_id?: string | null
          dest_id?: string | null
          schedule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'favorite_trips_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          trip_code: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          trip_code?: string | null
          active?: boolean
        }
        Update: {
          active?: boolean
          trip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      trip_reports: {
        Row: {
          id: string
          user_id: string | null
          trip_code: string
          date: string
          on_time: boolean | null
          train_short: boolean | null
          delay_mins: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          trip_code: string
          date: string
          on_time?: boolean | null
          train_short?: boolean | null
          delay_mins?: number | null
          notes?: string | null
        }
        Update: {
          trip_code?: string
          date?: string
          on_time?: boolean | null
          train_short?: boolean | null
          delay_mins?: number | null
          notes?: string | null
        }
        Relationships: []
      }
      adif_cache: {
        Row: {
          key: string
          data: Json
          expires_at: string
          created_at: string
        }
        Insert: {
          key: string
          data: Json
          expires_at: string
        }
        Update: {
          data?: Json
          expires_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
