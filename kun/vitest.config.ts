import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@kun': resolve('src')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    globals: false
  }
})
