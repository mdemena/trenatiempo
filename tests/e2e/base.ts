// URL base de la app, única fuente para derivar el origin de las cookies.
// Coincide con `use.baseURL` de playwright.config.ts.
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

export const BASE_ORIGIN = new URL(BASE_URL).origin
