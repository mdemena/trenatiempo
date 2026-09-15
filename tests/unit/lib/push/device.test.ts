import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseUserAgent, getDeviceInfo, deviceLabel } from '@/lib/push/device'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseUserAgent', () => {
  it('devuelve null con UA vacío', () => {
    expect(parseUserAgent(null)).toBeNull()
    expect(parseUserAgent(undefined)).toBeNull()
    expect(parseUserAgent('')).toBeNull()
  })

  it('detecta Chrome/Windows en desktop', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    )
    expect(info).toEqual({ browser: 'Chrome', os: 'Windows', mobile: false })
  })

  it('detecta Chrome/Android en móvil', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    )
    expect(info).toEqual({ browser: 'Chrome', os: 'Android', mobile: true })
  })

  it('detecta Safari/iOS en iPhone', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    )
    expect(info).toEqual({ browser: 'Safari', os: 'iOS', mobile: true })
  })

  it('distingue Edg/ de Chrome/', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
    )
    expect(info?.browser).toBe('Edge')
  })

  it('devuelve null cuando no hay señal de navegador ni SO', () => {
    expect(parseUserAgent('telegram-bot')).toBeNull()
  })
})

describe('getDeviceInfo', () => {
  it('usa Client Hints (modelo real) cuando están disponibles', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'ignored',
      userAgentData: {
        mobile: false,
        platform: 'Linux',
        brands: [
          { brand: 'Chromium', version: '126' },
          { brand: 'Google Chrome', version: '126' },
        ],
        getHighEntropyValues: async () => ({
          platform: 'Linux',
          model: 'Pixel 8',
          fullVersionList: [
            { brand: 'Chromium', version: '126.0.0.0' },
            { brand: 'Google Chrome', version: '126.0.0.0' },
          ],
        }),
      },
    })

    await expect(getDeviceInfo()).resolves.toEqual({
      browser: 'Chrome',
      os: 'Linux',
      model: 'Pixel 8',
      mobile: false,
    })
  })

  it('cae a los valores de bajo nivel si getHighEntropyValues falla', async () => {
    const uaData = {
      mobile: true,
      platform: 'Android',
      brands: [
        { brand: 'Google Chrome', version: '126' },
        { brand: 'Chromium', version: '126' },
      ],
      getHighEntropyValues: vi.fn().mockRejectedValue(new Error('denied')),
    }
    vi.stubGlobal('navigator', { userAgent: 'ignored', userAgentData: uaData })

    await expect(getDeviceInfo()).resolves.toEqual({
      browser: 'Chrome',
      os: 'Android',
      mobile: true,
    })
  })

  it('parsea el User-Agent cuando no hay userAgentData (Safari/Firefox)', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    })

    await expect(getDeviceInfo()).resolves.toEqual({
      browser: 'Safari',
      os: 'iOS',
      mobile: true,
    })
  })

  it('devuelve null sin navegador (SSR)', async () => {
    vi.stubGlobal('navigator', undefined)
    await expect(getDeviceInfo()).resolves.toBeNull()
  })
})

describe('deviceLabel', () => {
  it('compone modelo · navegador · OS', () => {
    expect(deviceLabel({ browser: 'Chrome', os: 'Android', model: 'Pixel 8' })).toBe(
      'Pixel 8 · Chrome · Android'
    )
  })

  it('omite campos vacíos', () => {
    expect(deviceLabel({ browser: 'Chrome', os: 'Windows', model: null })).toBe(
      'Chrome · Windows'
    )
    expect(deviceLabel({ browser: null, os: 'iOS', model: null })).toBe('iOS')
  })

  it('null cuando no hay nada', () => {
    expect(deviceLabel({ browser: null, os: null, model: null })).toBeNull()
  })
})