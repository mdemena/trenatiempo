export interface StationRow {
  id: string
  name: string
  lat: number
  lng: number
  types: string[]
  active: boolean
}

export interface StopTimeRow {
  trip_id: string
  route_id: string
  stop_id: string
  stop_sequence: number
  departure_time: string
  service_date: string
  feed_source: string
}
