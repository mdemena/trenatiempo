import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/push/web-push'

const notifySchema = z.object({
  tripCode: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: Request) {
  // Protect with CRON_SECRET or admin session
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const isAuthorizedCron =
    cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isAuthorizedCron) {
    // Fall back to admin session check
    const client = await createAdminClient()
    const {
      data: { user },
    } = await client.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await client
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => null)
  const parsed = notifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const { tripCode, title, body: msgBody, data } = parsed.data

  const client = await createAdminClient()
  const { data: subscriptions, error } = await client
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('trip_code', tripCode)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, cleaned: 0 })
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(sub, { title, body: msgBody, data })
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return NextResponse.json({ sent, failed, cleaned: 0 })
}
