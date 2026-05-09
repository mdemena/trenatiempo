// Tipos de dominio normalizados — capa de abstracción sobre GTFS/GTFS-RT

export type TipoServicio = 'cercanias' | 'md' | 'ave' | 'regional' | 'ld'
export type EstadoTren = 'a_tiempo' | 'retrasado' | 'cancelado' | 'desconocido'

export interface Estacion {
  id: string       // stop_id GTFS / código ADIF
  name: string
  shortName?: string
  lat: number
  lng: number
  province?: string
  region?: string
  types: TipoServicio[]
}

export interface EstacionConDistancia extends Estacion {
  distanciaKm: number
}

export interface Parada {
  stopId: string
  nombre: string
  llegadaProgramada?: number   // Unix timestamp
  llegadaReal?: number         // llegadaProgramada + delaySeg
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
  anden?: string               // "3" extraído de "PLATF.(3)"
  enMovimiento: boolean
}

export interface Tren {
  id: string                   // tripId GTFS
  routeId: string              // "C1", "R598", etc.
  tipo: TipoServicio
  paradas: Parada[]
  estado: EstadoTren
  retrasoSegundos?: number
  posicionActual?: PosicionTren
}

// ─── GTFS-RT raw types ────────────────────────────────────────────────────────

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

export interface TripUpdate {
  trip: TripDescriptor
  stopTimeUpdate: StopTimeUpdate[]
  vehicle?: { label: string }
  timestamp?: number
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

// ─── Tipos de respuesta interna ───────────────────────────────────────────────

export interface FeedResult {
  feed: GtfsRtFeed
  /** true cuando se sirve caché expirada porque el endpoint de Renfe falló */
  stale: boolean
  fetchedAt: number
}

export interface HorarioEntry {
  tripId: string
  routeId: string
  tipo: TipoServicio
  salidaProgramada: string      // "HH:MM:SS" en formato GTFS
  salidaReal?: string
  delaySeg: number
  cancelado: boolean
  anden?: string
  estado: EstadoTren
  destino?: string              // final destination name (requires GTFS static join)
  llegadaFinal?: string         // final arrival time HH:MM:SS (requires GTFS static join)
  numTren?: string              // numeric train identifier extracted from tripId (between X and line code)
}

export interface HorariosResponse {
  horarios: HorarioEntry[]
  updatedAt: number
  stale: boolean
}

export interface ViajeResponse {
  tren: Tren
  stale: boolean
  updatedAt: number
}
