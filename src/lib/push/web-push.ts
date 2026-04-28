// Stub: implementar con 'web-push' npm package
export interface PushPayload {
  title: string
  body: string
  icon?: string
  data?: Record<string, unknown>
}

export function buildPayload(payload: PushPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    data: payload.data,
  })
}
