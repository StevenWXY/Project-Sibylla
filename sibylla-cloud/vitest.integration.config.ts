import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000, // integration tests may need longer
    hookTimeout: 120000, // setup/teardown with Docker can be slow (Gitea wait up to 120s)
    // Disable parallel execution — integration tests share DB state
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Sequence integration test files to avoid port/state conflicts
    sequence: {
      concurrent: false,
    },
  },
})
