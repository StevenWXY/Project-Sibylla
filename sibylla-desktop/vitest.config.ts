import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 8000, // 8 seconds for file watcher tests
    hookTimeout: 8000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/main/**/*.ts'],
      exclude: ['src/main/**/*.d.ts', 'src/main/types/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      '@main': path.join(__dirname, 'src/main'),
      '@shared': path.join(__dirname, 'src/shared'),
    },
  },
})
