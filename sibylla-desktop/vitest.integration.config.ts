import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/sync-workflow.test.ts'],
    testTimeout: 30000, // integration tests may need longer for git ops
    hookTimeout: 60000, // Gitea setup can be slow on first boot
    // Run sequentially — tests share Gitea state
    sequence: {
      concurrent: false,
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
