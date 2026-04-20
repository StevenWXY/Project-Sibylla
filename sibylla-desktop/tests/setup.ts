/**
 * Global Test Setup
 *
 * This file is loaded before all test files to configure common mocks
 * and suppress noisy console output from production modules.
 */

import { vi } from 'vitest'

// Mock logger globally to suppress console output in tests.
// Individual tests can still import the mocked logger to assert on calls.
vi.mock('../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  LogLevel: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}))
