import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_MAILTO ?? 'admin@example.com'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    process.env.VAPID_PRIVATE_KEY ?? ''
  )
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  data?: Record<string, unknown>
}

export function buildPayload(payload: PushPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    badge: payload.badge ?? '/icons/icon-192.png',
    data: payload.data,
  })
}

export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

async function deleteExpiredSubscription(endpoint: string) {
  try {
    const client = await createAdminClient()
    await client.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch (err) {
    console.error('[web-push] Failed to delete expired subscription:', err)
  }
}

async function sendWithBackoff(
  sub: webpush.PushSubscription,
  payload: string,
  attempt = 0
): Promise<void> {
  ensureVapid()
  try {
    await webpush.sendNotification(sub, payload)
  } catch (err: unknown) {
    const error = err as { statusCode?: number; body?: string }
    if (error.statusCode === 410) {
      await deleteExpiredSubscription(sub.endpoint)
      return
    }
    if (error.statusCode === 429 && attempt < 3) {
      const delay = 1000 * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
      return sendWithBackoff(sub, payload, attempt + 1)
    }
    console.error('[web-push] Failed to send notification:', error.statusCode, error.body)
  }
}

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<void> {
  const pushSub: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }
  await sendWithBackoff(pushSub, buildPayload(payload))
}
