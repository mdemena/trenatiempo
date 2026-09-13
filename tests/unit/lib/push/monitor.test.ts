import { describe, it, expect } from 'vitest'
import {
  inferFeed,
  computeDelaySec,
  computeFeedMaxDelay,
  resolveDelaySec,
  shouldSendDelay,
  shouldSendArrival,
  computePredictedArrivalSec,
  formatHM,
  formatTripRef,
  isFeedFresh,
  DELAY_COOLDOWN_SEC,
} from '@/lib/push/monitor'
import type { StopTimeUpdate, TripUpdate } from '@/lib/renfe/types'

function rtStop(delay?: number, overrides: Partial<StopTimeUpdate> = {}): StopTimeUpdate {
  return {
    stopId: '79104',
    departure: delay !== undefined ? { delay } : undefined,
    ...overrides,
  }
}

function rtTrip(stops: StopTimeUpdate[]): TripUpdate {
  return {
    trip: { tripId: '5142X15734R11', routeId: 'R11' },
    stopTimeUpdate: stops,
  }
}

describe('inferFeed', () => {
  it('C1 → cercanias', () => {
    expect(inferFeed('C1')).toBe('cercanias')
  })
  it('C10 → cercanias', () => {
    expect(inferFeed('C10')).toBe('cercanias')
  })
  it('líneas R y buses → cercanias', () => {
    expect(inferFeed('R11')).toBe('cercanias')
    expect(inferFeed('R2S')).toBe('cercanias')
    expect(inferFeed('BUS')).toBe('cercanias')
    expect(inferFeed('RG1')).toBe('cercanias')
    expect(inferFeed('RL3')).toBe('cercanias')
  })
  it('Media Distancia / AV / Larga distancia → md', () => {
    expect(inferFeed('MD')).toBe('md')
    expect(inferFeed('ALVIA')).toBe('md')
    expect(inferFeed('AVE')).toBe('md')
    expect(inferFeed('REGIONAL')).toBe('md')
  })
  it('sin routeId → md (riesgo asumido: solo fallback legacy)', () => {
    expect(inferFeed(null)).toBe('md')
    expect(inferFeed(undefined)).toBe('md')
  })
})

describe('computeDelaySec', () => {
  it('usa departure.delay', () => {
    expect(computeDelaySec(rtStop(120))).toBe(120)
  })
  it('cae a arrival.delay si no hay departure', () => {
    expect(computeDelaySec({ stopId: '1', arrival: { delay: 60 } })).toBe(60)
  })
  it('0 sin datos', () => {
    expect(computeDelaySec(rtStop())).toBe(0)
    expect(computeDelaySec(undefined)).toBe(0)
    expect(computeDelaySec(null)).toBe(0)
  })
})

describe('computeFeedMaxDelay', () => {
  it('toma el mayor delay de las paradas', () => {
    const trip = rtTrip([rtStop(0, { arrival: { delay: 100 } }), rtStop(300), rtStop()])
    expect(computeFeedMaxDelay(trip)).toBe(300)
  })
  it('0 en feed vacío', () => {
    expect(computeFeedMaxDelay(undefined)).toBe(0)
    expect(computeFeedMaxDelay(null)).toBe(0)
    expect(computeFeedMaxDelay(rtTrip([]))).toBe(0)
  })
})

describe('resolveDelaySec', () => {
  it('usa el delay específico de la parada cuando existe', () => {
    const trip = rtTrip([rtStop(), rtStop(500)])
    expect(resolveDelaySec(rtStop(120), trip)).toBe(120)
  })
  it('cae al máximo del feed si la parada no reporta delay', () => {
    const trip = rtTrip([rtStop(), rtStop(500)])
    expect(resolveDelaySec(rtStop(), trip)).toBe(500)
  })
  it('usa arrival como delay específico', () => {
    const trip = rtTrip([rtStop()])
    expect(resolveDelaySec({ stopId: '1', arrival: { delay: 45 } }, trip)).toBe(45)
  })
})

describe('shouldSendDelay', () => {
  const now = 1_700_000_000

  it('envía si el retraso supera el umbral y no hay envío previo', () => {
    expect(shouldSendDelay({ delaySec: 300, nowSec: now, thresholdSec: 300, lastSentAtSec: null })).toBe(true)
  })
  it('no envía bajo el umbral', () => {
    expect(shouldSendDelay({ delaySec: 299, nowSec: now, thresholdSec: 300, lastSentAtSec: null })).toBe(false)
  })
  it('respeta el cooldown', () => {
    expect(
      shouldSendDelay({
        delaySec: 600,
        nowSec: now,
        thresholdSec: 300,
        lastSentAtSec: now - DELAY_COOLDOWN_SEC + 100,
      })
    ).toBe(false)
    expect(
      shouldSendDelay({
        delaySec: 600,
        nowSec: now,
        thresholdSec: 300,
        lastSentAtSec: now - DELAY_COOLDOWN_SEC,
      })
    ).toBe(true)
  })
  it('no envía con delay negativo', () => {
    expect(shouldSendDelay({ delaySec: -1, nowSec: now, thresholdSec: 300, lastSentAtSec: null })).toBe(false)
  })
})

describe('computePredictedArrivalSec / shouldSendArrival', () => {
  const scheduled = 1_700_000_000

  it('predice programada + delay', () => {
    expect(computePredictedArrivalSec(scheduled, 240)).toBe(scheduled + 240)
  })

  it('envía dentro de [predicha − umbral, predicha + margen]', () => {
    const predicted = scheduled
    // 10 min antes (600 s)
    expect(
      shouldSendArrival({ nowSec: predicted - 600, predictedSec: predicted, thresholdSec: 600 })
    ).toBe(true)
    // justo en el límite superior
    expect(
      shouldSendArrival({ nowSec: predicted + 120, predictedSec: predicted, thresholdSec: 600 })
    ).toBe(true)
  })

  it('no envía fuera de la ventana', () => {
    const predicted = scheduled
    expect(
      shouldSendArrival({ nowSec: predicted - 601, predictedSec: predicted, thresholdSec: 600 })
    ).toBe(false)
    expect(
      shouldSendArrival({ nowSec: predicted + 121, predictedSec: predicted, thresholdSec: 600 })
    ).toBe(false)
  })

  it('nunca envía si la cota superior es negativa', () => {
    expect(
      shouldSendArrival({ nowSec: scheduled, predictedSec: scheduled, thresholdSec: 600, marginSec: -1 })
    ).toBe(false)
  })

  it('la llegada retrasada desplaza la ventana', () => {
    const predicted = scheduled + 300
    expect(
      shouldSendArrival({ nowSec: predicted - 600, predictedSec: predicted, thresholdSec: 600 })
    ).toBe(true)
  })
})

describe('formatHM', () => {
  it('formatea HH:MM en Madrid', () => {
    const ts = new Date('2026-03-02T14:00:00+01:00').getTime() / 1000
    expect(formatHM(ts)).toBe('14:00')
  })
})

describe('formatTripRef', () => {
  it('extrae el número tras la X', () => {
    expect(formatTripRef('5142X15734R11')).toBe('15734')
  })
  it('devuelve el tripId completo si no hay X', () => {
    expect(formatTripRef('C1-23537')).toBe('C1-23537')
  })
  it('cubre el formato corto con sufijo alfanumérico', () => {
    expect(formatTripRef('5116X15734R2')).toBe('15734')
  })
})

describe('isFeedFresh', () => {
  const now = 1_700_000_000

  it('acepta feeds recientes', () => {
    expect(isFeedFresh({ header: { timestamp: now - 30 } }, now)).toBe(true)
  })
  it('rechaza feeds viejos', () => {
    expect(isFeedFresh({ header: { timestamp: now - 600 } }, now)).toBe(false)
  })
  it('rechaza feeds sin timestamp', () => {
    expect(isFeedFresh({ header: {} }, now)).toBe(false)
    expect(isFeedFresh(null, now)).toBe(false)
  })
})