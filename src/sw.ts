import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkFirst, StaleWhileRevalidate } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: WorkerGlobalScope

const runtimeCaching: RuntimeCaching[] = [
  // Static assets — CacheFirst, 30 days
  {
    matcher: /^\/_next\/static\/.*/i,
    handler: new CacheFirst({
      cacheName: 'next-static',
      plugins: [
        new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
  // Google Fonts — CacheFirst, 1 year
  {
    matcher: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
    handler: new CacheFirst({
      cacheName: 'google-fonts',
      plugins: [
        new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      ],
    }),
  },
  // App icons and images — CacheFirst, 7 days
  {
    matcher: /^\/(icons|images)\/.*/i,
    handler: new CacheFirst({
      cacheName: 'static-assets',
      plugins: [
        new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  },
  // Estaciones API — StaleWhileRevalidate, 24h
  {
    matcher: /^\/api\/renfe\/estaciones.*/i,
    handler: new StaleWhileRevalidate({
      cacheName: 'api-estaciones',
      plugins: [
        new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
  // Horarios API — NetworkFirst with 5s timeout
  {
    matcher: /^\/api\/renfe\/horarios.*/i,
    handler: new NetworkFirst({
      cacheName: 'api-horarios',
      networkTimeoutSeconds: 5,
      plugins: [
        new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 }),
      ],
    }),
  },
  // All other routes — NetworkFirst with offline fallback
  {
    matcher: /^https?.*/,
    handler: new NetworkFirst({
      cacheName: 'others',
      networkTimeoutSeconds: 10,
      plugins: [
        new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
  ...defaultCache,
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: '/offline.html',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.addEventListeners()
