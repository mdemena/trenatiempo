export const RENFE_GTFSRT = {
  tripUpdatesCercanias: 'https://gtfsrt.renfe.com/trip_updates.json',
  vehiclePositionsCercanias: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  tripUpdatesLD: 'https://gtfsrt.renfe.com/trip_updates_ld.json',
  vehiclePositionsLD: 'https://gtfsrt.renfe.com/vehicle_positions_ld.json',
  serviceAlerts: 'https://gtfsrt.renfe.com/service_alerts.json',
} as const

export const RENFE_GTFS_STATIC = {
  cercanias:
    'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
} as const

export const CACHE_TTL = {
  cercanias: 20,
  md: 30,
} as const
