import { create } from 'zustand'
import type { Database } from '@/types/database'

type TripFav = Database['public']['Tables']['favorite_trips']['Row']

interface FavoritesState {
  stationIds: Set<string>
  trips: TripFav[]
  loaded: boolean
  loading: boolean
  setStationIds: (ids: string[]) => void
  setTrips: (trips: TripFav[]) => void
  addStation: (id: string) => void
  removeStation: (id: string) => void
  addTrip: (trip: TripFav) => void
  removeTrip: (tripCode: string) => void
  isStationFav: (id: string) => boolean
  isTripFav: (tripCode: string) => boolean
  setLoading: (v: boolean) => void
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  stationIds: new Set(),
  trips: [],
  loaded: false,
  loading: false,
  setStationIds: (ids) => set({ stationIds: new Set(ids), loaded: true }),
  setTrips: (trips) => set({ trips }),
  addStation: (id) =>
    set((s) => {
      const next = new Set(s.stationIds)
      next.add(id)
      return { stationIds: next }
    }),
  removeStation: (id) =>
    set((s) => {
      const next = new Set(s.stationIds)
      next.delete(id)
      return { stationIds: next }
    }),
  addTrip: (trip) => set((s) => ({ trips: [trip, ...s.trips] })),
  removeTrip: (tripCode) =>
    set((s) => ({ trips: s.trips.filter((t) => t.trip_code !== tripCode) })),
  isStationFav: (id) => get().stationIds.has(id),
  isTripFav: (tripCode) => get().trips.some((t) => t.trip_code === tripCode),
  setLoading: (loading) => set({ loading }),
}))
