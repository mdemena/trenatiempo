import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/renfe/time'
import {
  DELAY_THRESHOLD_DEFAULT_SEC,
  ARRIVAL_THRESHOLD_DEFAULT_SEC,
} from '@/lib/push/monitor'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  tripCode: z.string().optional(),
  stationId: z.string().optional(),
  /** Fecha ISO (yyyy-mm-dd) de la corrida suscrita. Por defecto hoy. Nunca futura. */
  serviceDate: z.string().regex(ISO_DATE, 'serviceDate debe tener formato YYYY-MM-DD').optional(),
  notifyDelay: z.boolean().optional(),
  notifyArrival: z.boolean().optional(),
  delayThresholdSec: z.number().int().min(60).max(3600).optional(),
  arrivalThresholdSec: z.number().int().min(60).max(3600).optional(),
}).superRefine((data, ctx) => {
  // Sin flags explícitos → comportamiento antiguo: aviso de retraso siempre,
  // aviso de llegada solo si conocemos la estación.
  const notifyDelay = data.notifyDelay ?? true
  const notifyArrival =
    data.notifyArrival ?? (data.stationId ? true : false)

  if (!notifyDelay && !notifyArrival) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Se necesita al menos un tipo de aviso (retraso o llegada)',
    })
  }
  if (notifyArrival && !data.stationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stationId'],
      message: 'El aviso de llegada requiere una estación',
    })
  }
})

const deleteSchema = z.object({
  endpoint: z.string().url(),
  /** Filtra por tren para no borrar otras suscripciones del dispositivo. */
  tripCode: z.string().optional(),
})

function resolveNotifyFlags(data: z.infer<typeof subscriptionSchema>) {
  const notifyDelay = data.notifyDelay ?? true
  const notifyArrival = data.notifyArrival ?? (data.stationId ? true : false)
  return { notifyDelay, notifyArrival }
}

// ─── POST /api/push/subscribe ─────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = subscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Bad Request' },
      { status: 400 }
    )
  }

  const data = parsed.data
  const today = todayISO()
  const serviceDate = data.serviceDate ?? today

  if (serviceDate > today) {
    return NextResponse.json(
      { error: 'No se puede suscribir a una fecha futura' },
      { status: 400 }
    )
  }

  const { notifyDelay, notifyArrival } = resolveNotifyFlags(data)

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: data.subscription.endpoint,
        p256dh: data.subscription.keys.p256dh,
        auth: data.subscription.keys.auth,
        trip_code: data.tripCode ?? null,
        station_id: data.stationId ?? null,
        notify_delay: notifyDelay,
        notify_arrival: notifyArrival,
        delay_threshold_sec: data.delayThresholdSec ?? DELAY_THRESHOLD_DEFAULT_SEC,
        arrival_threshold_sec: data.arrivalThresholdSec ?? ARRIVAL_THRESHOLD_DEFAULT_SEC,
        service_date: serviceDate,
        active: true,
      },
      { onConflict: 'user_id,endpoint,trip_code' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ─── DELETE /api/push/subscribe ───────────────────────────────────────────────

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  let query = supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', user.id)

  // Con tripCode se borra SOLO la suscripción de ese tren; sin él se mantiene el
  // comportamiento histórico (todas las de ese endpoint del usuario) para
  // clientes sin actualizar.
  if (parsed.data.tripCode) {
    query = query.eq('trip_code', parsed.data.tripCode)
  }

  const { error, data: deleted } = await query.select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: deleted ?? [] })
}