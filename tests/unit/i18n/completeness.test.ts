import { describe, it, expect } from 'vitest'
import es from '../../../messages/es.json'
import ca from '../../../messages/ca.json'
import gl from '../../../messages/gl.json'
import eu from '../../../messages/eu.json'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'

type AnyObject = Record<string, unknown>

/** Extrae todas las claves de un objeto JSON anidado en formato "section.key" */
function getKeys(obj: AnyObject, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const fullKey = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null
      ? getKeys(v as AnyObject, fullKey)
      : [fullKey]
  })
}

const baseKeys = getKeys(es as AnyObject)

const locales = [
  { name: 'ca', messages: ca },
  { name: 'gl', messages: gl },
  { name: 'eu', messages: eu },
  { name: 'en', messages: en },
  { name: 'fr', messages: fr },
] as const

describe('i18n — completitud de traducciones', () => {
  it('el idioma base (es) tiene más de 0 claves', () => {
    expect(baseKeys.length).toBeGreaterThan(0)
  })

  for (const { name, messages } of locales) {
    describe(`locale: ${name}`, () => {
      const keys = getKeys(messages as AnyObject)

      it('no tiene claves extra no presentes en es.json', () => {
        const extra = keys.filter((k) => !baseKeys.includes(k))
        expect(extra, `Claves extra en ${name}: ${extra.join(', ')}`).toHaveLength(0)
      })

      it('tiene todas las claves de es.json', () => {
        const missing = baseKeys.filter((k) => !keys.includes(k))
        expect(missing, `Claves faltantes en ${name}: ${missing.join(', ')}`).toHaveLength(0)
      })
    })
  }
})

describe('i18n — estructura de secciones', () => {
  const expectedSections = ['common', 'nav', 'home', 'horarios', 'viaje', 'auth', 'profile', 'favorites', 'admin', 'pwa', 'errors']

  it('es.json contiene todas las secciones esperadas', () => {
    const topKeys = Object.keys(es)
    for (const section of expectedSections) {
      expect(topKeys, `Sección '${section}' falta en es.json`).toContain(section)
    }
  })
})
