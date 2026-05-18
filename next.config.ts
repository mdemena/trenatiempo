import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import withPWAInit from '@ducanh2912/next-pwa'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV !== 'production',
  register: true,
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline.html',
  },
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // Static assets — CacheFirst, 30 days
      {
        urlPattern: /^\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      // Google Fonts — CacheFirst, 1 year
      {
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      // App icons and images — CacheFirst, 7 days
      {
        urlPattern: /^\/(icons|images)\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      // Estaciones API — StaleWhileRevalidate, 24h
      {
        urlPattern: /^\/api\/renfe\/estaciones.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'api-estaciones',
          expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Horarios API — NetworkFirst with 30s offline fallback
      {
        urlPattern: /^\/api\/renfe\/horarios.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-horarios',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 30, maxAgeSeconds: 30 },
        },
      },
      // All other routes — NetworkFirst with offline fallback
      {
        urlPattern: /^https?.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'others',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
    ],
  },
})

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default withPWA(withNextIntl(nextConfig))
