/**
 * Official Renfe/Rodalies line colors extracted from GTFS routes.txt.
 * Key = route_short_name (e.g. "R2", "C1", "R2N").
 */
export const ROUTE_COLORS: Record<string, { bg: string; text: string }> = {
  // ── Cercanías Madrid ───────────────────────────────────────────────────────
  C1:  { bg: '#75B6E0', text: '#FFFFFF' },
  C1a: { bg: '#D7001E', text: '#FFFFFF' },
  C2:  { bg: '#00943D', text: '#FFFFFF' },
  C3:  { bg: '#952585', text: '#FFFFFF' },
  C4:  { bg: '#2C2A86', text: '#FFFFFF' },
  C4A: { bg: '#E93CAC', text: '#FFFFFF' },
  C4a: { bg: '#2C2A86', text: '#FFFFFF' },
  C4b: { bg: '#2C2A86', text: '#FFFFFF' },
  C5:  { bg: '#FECB00', text: '#000000' },
  C5a: { bg: '#C4D600', text: '#000000' },
  C6:  { bg: '#579BE2', text: '#FFFFFF' },
  C7:  { bg: '#E5202A', text: '#FFFFFF' },
  C8:  { bg: '#868584', text: '#FFFFFF' },
  C8a: { bg: '#868584', text: '#FFFFFF' },
  C8b: { bg: '#868584', text: '#FFFFFF' },
  C9:  { bg: '#F3972A', text: '#FFFFFF' },
  C10: { bg: '#BCCF00', text: '#000000' },
  // ── Rodalies de Catalunya ─────────────────────────────────────────────────
  R1:  { bg: '#7DBCEC', text: '#FFFFFF' },
  R2:  { bg: '#26A741', text: '#FFFFFF' },
  R2N: { bg: '#D0DF00', text: '#000000' },
  R2S: { bg: '#146520', text: '#FFFFFF' },
  R3:  { bg: '#E54A3C', text: '#FFFFFF' },
  R3a: { bg: '#E54A3C', text: '#FFFFFF' },
  R4:  { bg: '#F7A30D', text: '#FFFFFF' },
  R7:  { bg: '#B57CBB', text: '#FFFFFF' },
  R8:  { bg: '#88016A', text: '#FFFFFF' },
  R11: { bg: '#0069AA', text: '#FFFFFF' },
  R13: { bg: '#146520', text: '#FFFFFF' },
  R14: { bg: '#6C60A8', text: '#FFFFFF' },
  R15: { bg: '#978571', text: '#FFFFFF' },
  R16: { bg: '#B52B46', text: '#FFFFFF' },
  R17: { bg: '#F3B12E', text: '#FFFFFF' },
  // ── Otras ─────────────────────────────────────────────────────────────────
  RG1: { bg: '#409EF5', text: '#FFFFFF' },
  RL3: { bg: '#B6AE33', text: '#FFFFFF' },
  RL4: { bg: '#F7A30D', text: '#FFFFFF' },
  RT1: { bg: '#39D4CC', text: '#FFFFFF' },
  RT2: { bg: '#F965DE', text: '#FFFFFF' },
  T1:  { bg: '#C4D600', text: '#000000' },
}

/**
 * Returns the display name for a routeId.
 * The seed script stores route_short_name directly (e.g. "R2", "C1"),
 * so this is a simple trim. Falls back to stripping the GTFS numeric
 * prefix in case old data is present.
 */
export function routeShortName(routeId: string): string {
  const trimmed = routeId.trim()
  // Already a short name (no GTFS prefix pattern)
  if (!/^\d{2}T\d{4}/.test(trimmed)) return trimmed
  // Legacy: strip the "{2d}T{4d}" prefix
  return trimmed.replace(/^\d{2}T\d{4}/, '').trim() || trimmed
}

/** Returns color config for a given routeId (falls back to neutral). */
export function getRouteColors(routeId: string): { bg: string; text: string } {
  const short = routeShortName(routeId)
  return ROUTE_COLORS[short] ?? { bg: '#4B5563', text: '#FFFFFF' }
}
