import { describe, it, expect } from 'vitest'
import { getDistanceKm, findNearestStations, boundingBox } from '@/lib/geo/nearest-station'
import type { Estacion } from '@/lib/renfe/types'

// Coordenadas reales para verificar resultados conocidos
const ATOCHA = { lat: 40.4063, lng: -3.6892 }    // Madrid Atocha
const SANTS = { lat: 41.3792, lng: 2.1400 }       // Barcelona Sants

function makeStation(id: string, lat: number, lng: number): Estacion {
  return { id, name: `Estacion ${id}`, lat, lng, types: ['cercanias'] }
}

describe('getDistanceKm', () => {
  it('devuelve 0 para coordenadas idénticas', () => {
    expect(getDistanceKm(40.0, -3.7, 40.0, -3.7)).toBe(0)
  })

  it('calcula ~502 km entre Madrid Atocha y Barcelona Sants', () => {
    const dist = getDistanceKm(ATOCHA.lat, ATOCHA.lng, SANTS.lat, SANTS.lng)
    expect(dist).toBeGreaterThan(470)
    expect(dist).toBeLessThan(540)
  })

  it('es simétrica (d(A,B) === d(B,A))', () => {
    const d1 = getDistanceKm(40.0, -3.7, 41.5, 2.0)
    const d2 = getDistanceKm(41.5, 2.0, 40.0, -3.7)
    expect(d1).toBeCloseTo(d2, 6)
  })

  it('devuelve valores positivos para coordenadas distintas', () => {
    expect(getDistanceKm(0, 0, 0, 1)).toBeGreaterThan(0)
    expect(getDistanceKm(0, 0, 1, 0)).toBeGreaterThan(0)
  })

  it('1 grado de latitud ≈ 111 km', () => {
    const dist = getDistanceKm(40.0, 0, 41.0, 0)
    expect(dist).toBeGreaterThan(108)
    expect(dist).toBeLessThan(114)
  })
})

describe('findNearestStations', () => {
  const stations: Estacion[] = [
    makeStation('A', 40.41, -3.69),   // ~0.5 km de Atocha
    makeStation('B', 40.45, -3.69),   // ~4 km de Atocha
    makeStation('C', 40.50, -3.69),   // ~10 km de Atocha
    makeStation('D', 40.35, -3.69),   // ~6 km de Atocha
    makeStation('E', 40.42, -3.70),   // ~1.2 km de Atocha
  ]

  it('ordena por distancia ascendente', () => {
    const result = findNearestStations(ATOCHA, stations)
    const distances = result.map((s) => s.distanciaKm)
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]!)
    }
  })

  it('respeta el límite de resultados', () => {
    expect(findNearestStations(ATOCHA, stations, 3)).toHaveLength(3)
    expect(findNearestStations(ATOCHA, stations, 1)).toHaveLength(1)
  })

  it('devuelve array vacío si no hay estaciones', () => {
    expect(findNearestStations(ATOCHA, [])).toHaveLength(0)
  })

  it('incluye la propiedad distanciaKm en cada resultado', () => {
    const result = findNearestStations(ATOCHA, stations, 2)
    for (const s of result) {
      expect(s.distanciaKm).toBeTypeOf('number')
      expect(s.distanciaKm).toBeGreaterThanOrEqual(0)
    }
  })

  it('filtra estaciones con coordenadas (0,0)', () => {
    const withZero = [...stations, makeStation('Z', 0, 0)]
    const result = findNearestStations(ATOCHA, withZero)
    expect(result.find((s) => s.id === 'Z')).toBeUndefined()
  })
})

describe('boundingBox', () => {
  it('genera un box que contiene el punto de origen', () => {
    const { minLat, maxLat, minLng, maxLng } = boundingBox(40.4, -3.7, 50)
    expect(40.4).toBeGreaterThanOrEqual(minLat)
    expect(40.4).toBeLessThanOrEqual(maxLat)
    expect(-3.7).toBeGreaterThanOrEqual(minLng)
    expect(-3.7).toBeLessThanOrEqual(maxLng)
  })

  it('el box es mayor con radio más grande', () => {
    const small = boundingBox(40.4, -3.7, 10)
    const large = boundingBox(40.4, -3.7, 100)
    expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat)
  })
})
