import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Vitest config for renderer (React) component tests
 * Uses jsdom environment for DOM simulation
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/renderer/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['tests/renderer/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 15000,
    css: false,
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      '@renderer': path.join(__dirname, 'src/renderer'),
      '@shared': path.join(__dirname, 'src/shared'),
    },
  },
})
