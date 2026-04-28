export interface Estacion {
  id: string
  name: string
  shortName?: string
  lat: number
  lng: number
  province?: string
  region?: string
  types: ('cercanias' | 'md' | 'ave' | 'regional' | 'ld')[]
}

export interface Parada {
  stopId: string
  nombre: string
  llegadaProgramada?: number
  llegadaReal?: number
  salidaProgramada?: number
  salidaReal?: number
  delaySeg?: number
  esOrigen: boolean
  esDestino: boolean
}

export interface PosicionTren {
  lat: number
  lng: number
  stopId?: string
  anden?: string
  enMovimiento: boolean
}

export type EstadoTren = 'a_tiempo' | 'retrasado' | 'cancelado' | 'desconocido'
export type TipoTren = 'cercanias' | 'md' | 'ave' | 'regional' | 'ld'

export interface Tren {
  id: string
  routeId: string
  tipo: TipoTren
  paradas: Parada[]
  estado: EstadoTren
  retrasoSegundos?: number
  posicionActual?: PosicionTren
}

// GTFS-RT raw types
export interface GtfsRtFeed {
  header: {
    gtfsRealtimeVersion: string
    timestamp: number
  }
  entity: GtfsRtEntity[]
}

export interface GtfsRtEntity {
  id: string
  tripUpdate?: TripUpdate
  vehicle?: VehiclePosition
  alert?: ServiceAlert
}

export interface TripUpdate {
  trip: TripDescriptor
  stopTimeUpdate: StopTimeUpdate[]
  vehicle?: { label: string }
}

export interface TripDescriptor {
  tripId: string
  routeId: string
  directionId?: number
}

export interface StopTimeUpdate {
  stopSequence?: number
  stopId?: string
  arrival?: TimeEvent
  departure?: TimeEvent
  scheduleRelationship?: 'SCHEDULED' | 'SKIPPED' | 'NO_DATA' | 'CANCELED'
}

export interface TimeEvent {
  delay?: number
  time?: number
  uncertainty?: number
}

export interface VehiclePosition {
  trip?: TripDescriptor
  position?: {
    latitude: number
    longitude: number
    speed?: number
  }
  currentStatus?: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO'
  stopId?: string
  label?: string
  timestamp?: number
}

export interface ServiceAlert {
  activePeriod?: Array<{ start?: number; end?: number }>
  informedEntity?: Array<{ routeId?: string; stopId?: string }>
  headerText?: { translation: Array<{ text: string; language?: string }> }
  descriptionText?: { translation: Array<{ text: string; language?: string }> }
}
