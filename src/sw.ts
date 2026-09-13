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

// ─── Push notifications ────────────────────────────────────────────────────────
// `self` (WorkerGlobalScope) no expone los eventos push/notificationclick ni
// `clients`; usamos el scope real de Service Worker para el tipado.

const swScope = self as unknown as ServiceWorkerGlobalScope

interface PushNotificationData {
  url?: string
  tripCode?: string
  serviceDate?: string
  type?: string
}

const NOTIFICATION_OPTIONS = {
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  actions: [
    {
      action: 'open',
      title: 'Abrir',
    },
  ],
} as const

swScope.addEventListener('push', (event) => {
  if (!event.data) return

  let payload: { title?: string; body?: string; data?: PushNotificationData } | null = null
  try {
    payload = event.data.json()
  } catch {
    return
  }
  if (!payload || !payload.title) return

  // Guarda defensiva: Notification no existe en algunos contextos WebKit.
  if (typeof Notification === 'undefined') return

  const { data } = payload
  event.waitUntil(
    swScope.registration.showNotification(payload.title, {
      body: payload.body ?? '',
      ...NOTIFICATION_OPTIONS,
      data: data ?? {},
      // Misma etiqueta para un mismo tren/tipo/día → las notificaciones
      // repetidas se reemplazan en lugar de apilarse.
      ...(data?.tripCode
        ? { tag: `${data.type ?? 'alert'}-${data.tripCode}-${data.serviceDate ?? ''}` }
        : {}),
    })
  )
})

swScope.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = event.notification.data?.url ?? '/'
  const absoluteUrl = new URL(target, swScope.location.origin).href

  event.waitUntil(
    (async () => {
      const windowClients = await swScope.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of windowClients) {
        if ('navigate' in client && 'focus' in client) {
          await client.navigate(absoluteUrl)
          await client.focus()
          return
        }
      }
      if (swScope.clients.openWindow) {
        await swScope.clients.openWindow(absoluteUrl)
      }
    })()
  )
})
