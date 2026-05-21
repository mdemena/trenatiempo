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

export interface HorarioFeedDetail {
  name: string
  source: string
  activeServiceIds: string[]
  routesLoaded: number
  activeTrips: number
  rowsParsed: number
  rowsInserted: number
  rowsFailed: number
  error?: string
}

export interface HorarioImportResult {
  totalRows: number
  failures: string[]
  rows: StopTimeRow[]
  serviceDate: string
  feeds: HorarioFeedDetail[]
}
