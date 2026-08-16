import { create } from 'zustand'
import type { Estacion } from '@/lib/renfe/types'
import type { Database } from '@/types/database'

type TripFav = Database['public']['Tables']['favorite_trips']['Row']

interface FavoritesState {
  stations: Estacion[]
  trips: TripFav[]
  loaded: boolean
  loading: boolean
  setStations: (stations: Estacion[]) => void
  setTrips: (trips: TripFav[]) => void
  addStation: (station: Estacion) => void
  removeStation: (id: string) => void
  addTrip: (trip: TripFav) => void
  removeTrip: (tripCode: string) => void
  isStationFav: (id: string) => boolean
  isTripFav: (tripCode: string) => boolean
  setLoading: (v: boolean) => void
  reset: () => void
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  stations: [],
  trips: [],
  loaded: false,
  loading: false,
  setStations: (stations) => set({ stations, loaded: true }),
  setTrips: (trips) => set({ trips }),
  addStation: (station) =>
    set((s) =>
      s.stations.some((x) => x.id === station.id)
        ? {}
        : { stations: [station, ...s.stations] }
    ),
  removeStation: (id) => set((s) => ({ stations: s.stations.filter((x) => x.id !== id) })),
  addTrip: (trip) => set((s) => ({ trips: [trip, ...s.trips] })),
  removeTrip: (tripCode) =>
    set((s) => ({ trips: s.trips.filter((t) => t.trip_code !== tripCode) })),
  isStationFav: (id) => get().stations.some((s) => s.id === id),
  isTripFav: (tripCode) => get().trips.some((t) => t.trip_code === tripCode),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ stations: [], trips: [], loaded: false, loading: false }),
}))
