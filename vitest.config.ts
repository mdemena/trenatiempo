import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/lib/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
