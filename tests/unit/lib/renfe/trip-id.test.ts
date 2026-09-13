import { describe, it, expect } from 'vitest'
import { extractTrainNumber, extractRouteId } from '@/lib/renfe/trip-id'

describe('extractTrainNumber', () => {
  it.each([
    // Cercanías R con prefijo de servicio: cada día varía el prefijo.
    ['5154D15726R11', 'R11', '15726'],
    ['5155L15726R11', 'R11', '15726'],
    ['5142X15734R11', 'R11', '15734'],
    // Cercanías C.
    ['6265J71110C2', 'C2', '71110'],
    ['1053S27511C4b', 'C4b', '27511'],
    ['4770M00024BUS', 'BUS', '00024'],
    ['5173V28277R2S', 'R2S', '28277'],
    // Cercanías con guion.
    ['C1-23537', 'C1', '23537'],
    // MD/AV con fecha incrustada (sin línea en el trip_id).
    ['0019212026-09-01', 'ALVIA', '001921'],
    ['0019222026-09-01', 'ALVIA', '001922'],
    ['0028012026-09-01', 'Intercity', '002801'],
  ])('%s (%s) → %s', (tripId, routeId, expected) => {
    expect(extractTrainNumber(tripId, routeId)).toBe(expected)
  })

  it('sin dibujar la línea cae al patrón sin separador', () => {
    expect(extractTrainNumber('5154D15726R11', null)).toBe('15726')
    expect(extractTrainNumber('6265J71110C2', null)).toBe('71110')
    expect(extractTrainNumber('C1-23537', null)).toBe('23537')
    expect(extractTrainNumber('0019212026-09-01', null)).toBe('001921')
  })

  it('devuelve null con entradas vacías', () => {
    expect(extractTrainNumber('', null)).toBeNull()
    expect(extractTrainNumber(null as unknown as string, null)).toBeNull()
  })
})

describe('extractRouteId', () => {
  it.each([
    ['5154D15726R11', 'R11'],
    ['6265J71110C2', 'C2'],
    ['1053S27511C4b', 'C4b'],
    ['4770M00024BUS', 'BUS'],
    ['5173V28277R2S', 'R2S'],
    ['C1-23537', 'C1'],
    ['0019212026-09-01', null],
    ['', null],
  ])('%s → %s', (tripId, expected) => {
    expect(extractRouteId(tripId)).toBe(expected)
  })
})