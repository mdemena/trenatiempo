export interface StationRow {
  id: string
  name: string
  lat: number
  lng: number
  types: string[]
  active: boolean
}

/** Row for gtfs_stop_times — date-independent (calendar resolves dates). */
export interface StopTimeRow {
  trip_id: string
  route_id: string
  stop_id: string
  stop_sequence: number
  departure_time: string
  feed_source: string
}

/** Row for gtfs_services — from calendar.txt. */
export interface ServiceRow {
  service_id: string
  feed_source: string
  start_date: string // ISO yyyy-mm-dd
  end_date: string   // ISO yyyy-mm-dd
  monday: boolean
  tuesday: boolean
  wednesday: boolean
  thursday: boolean
  friday: boolean
  saturday: boolean
  sunday: boolean
}

/** Row for gtfs_service_exceptions — from calendar_dates.txt. */
export interface ServiceExceptionRow {
  service_id: string
  feed_source: string
  exception_date: string // ISO yyyy-mm-dd
  exception_type: number // 1 = added, 2 = removed
}

/** Row for gtfs_trips — trip → service mapping. */
export interface TripRow {
  trip_id: string
  service_id: string
  route_id: string
  feed_source: string
}

export interface HorarioFeedDetail {
  name: string
  source: string
  servicesCount: number
  exceptionsCount: number
  tripsCount: number
  routesLoaded: number
  coverageStart?: string
  coverageEnd?: string
  rowsParsed: number
  rowsInserted: number
  rowsFailed: number
  error?: string
}

export interface HorarioImportResult {
  totalStopTimes: number
  servicesCount: number
  exceptionsCount: number
  tripsCount: number
  failures: string[]
  stopTimeRows: StopTimeRow[]
  serviceRows: ServiceRow[]
  exceptionRows: ServiceExceptionRow[]
  tripRows: TripRow[]
  feeds: HorarioFeedDetail[]
}
