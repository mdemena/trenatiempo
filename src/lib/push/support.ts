/**
 * Detección de soporte real de Web Push en el navegador actual.
 *
 * iOS Safari requiere que la app esté instalada en pantalla de inicio
 * (display-mode: standalone) para que PushManager funcione. En una pestaña
 * normal de Safari, `typeof Notification === 'function'` puede ser true pero
 * `requestPermission()` no muestra ningún prompt y `subscribe()` falla con
 * "permission denied". Detectamos esto para ofrecer al usuario una
 * alternativa en vez de una experiencia de fallo silencioso.
 */

export type PushSupportResult =
  | { supported: true; permission: NotificationPermission }
  | { supported: false; reason: 'not_secure' | 'no_notification_api' | 'no_push_api' | 'ios_not_installed' }

export function getPushSupport(): PushSupportResult {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'no_push_api' }
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: 'not_secure' }
  }

  if (typeof Notification === 'undefined') {
    return { supported: false, reason: 'no_notification_api' }
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: 'no_push_api' }
  }

  // iOS Safari: PushManager solo funciona tras instalar la app en pantalla de
  // inicio. En Safari normal, subscribe() falla silenciosamente.
  const ua = navigator.userAgent
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari: navigator.standalone (true solo cuando instalado)
    Boolean('standalone' in navigator && (navigator as unknown as { standalone?: boolean }).standalone)

  if (isIOS && !isStandalone) {
    return { supported: false, reason: 'ios_not_installed' }
  }

  return { supported: true, permission: Notification.permission }
}

/** Acceso seguro a Notification que no crashea en contextos sin API. */
export function safeNotificationPermission(): NotificationPermission | 'unavailable' {
  try {
    if (typeof Notification !== 'undefined' && 'permission' in Notification) {
      return Notification.permission
    }
  } catch {
    // WebKit puede lanzar en algunos modos privados
  }
  return 'unavailable'
}

export async function safeRequestNotificationPermission(): Promise<NotificationPermission | 'unavailable'> {
  try {
    if (typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
      return await Notification.requestPermission()
    }
  } catch {
    // si la API existe pero no soporta requestPermission (WebKit edge case)
  }
  return 'unavailable'
}
