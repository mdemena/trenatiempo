import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/renfe/time'
import { extractRouteId, extractTrainNumber } from '@/lib/renfe/trip-id'
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
  /** trip_id de la corrida vista al suscribirse (identificativo/de enlace).
   *  La suscripción es al TREN, no a este trip concreto. */
  tripCode: z.string().optional(),
  stationId: z.string().optional(),
  /** Identidad durable del tren: número + línea. Si no se envían, se derivan
   *  de tripCode (compatibilidad con clientes sin actualizar). */
  trainNumber: z.string().regex(/^\d{1,8}$/, 'trainNumber debe ser numérico').optional(),
  routeId: z.string().max(20).optional(),
  /** Fecha desde la que se suscribió (informativa; NO ata la suscripción). */
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
  /** Filtra por tren (trip_code o identidad número+línea) para no borrar
   *  otras suscripciones del dispositivo. */
  tripCode: z.string().optional(),
  trainNumber: z.string().regex(/^\d{1,8}$/).optional(),
  routeId: z.string().max(20).optional(),
})

function resolveNotifyFlags(data: z.infer<typeof subscriptionSchema>) {
  const notifyDelay = data.notifyDelay ?? true
  const notifyArrival = data.notifyArrival ?? (data.stationId ? true : false)
  return { notifyDelay, notifyArrival }
}

function resolveTrainIdentity(
  data: z.infer<typeof subscriptionSchema>
): { trainNumber: string | null; routeId: string | null } {
  const trainNumber =
    data.trainNumber ?? (data.tripCode ? extractTrainNumber(data.tripCode, data.routeId) : null)
  const routeId = data.routeId ?? (data.tripCode ? extractRouteId(data.tripCode) : null)
  return { trainNumber, routeId }
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

  const { trainNumber, routeId } = resolveTrainIdentity(data)
  if (!trainNumber) {
    return NextResponse.json(
      { error: 'No se puede identificar el tren: envía tripCode o trainNumber+routeId' },
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
        train_number: trainNumber,
        route_id: routeId,
        station_id: data.stationId ?? null,
        notify_delay: notifyDelay,
        notify_arrival: notifyArrival,
        delay_threshold_sec: data.delayThresholdSec ?? DELAY_THRESHOLD_DEFAULT_SEC,
        arrival_threshold_sec: data.arrivalThresholdSec ?? ARRIVAL_THRESHOLD_DEFAULT_SEC,
        service_date: serviceDate,
        active: true,
      },
      { onConflict: 'user_id,endpoint,train_number,route_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, trainNumber, routeId })
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

  // Filtro por tren. Con tripCode se borra la suscripción de ese trip; si el
  // cliente envía trainNumber (identidad durable) se borra por tren — con
  // routeId como refinamiento (si no se conoce, p.ej. MD sin línea, basta el
  // número). Sin filtro se mantiene el comportamiento histórico (todas las del
  // endpoint).
  if (parsed.data.tripCode) {
    query = query.eq('trip_code', parsed.data.tripCode)
  } else if (parsed.data.trainNumber) {
    query = query.eq('train_number', parsed.data.trainNumber)
    if (parsed.data.routeId) query = query.eq('route_id', parsed.data.routeId)
  }

  const { error, data: deleted } = await query.select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: deleted ?? [] })
}