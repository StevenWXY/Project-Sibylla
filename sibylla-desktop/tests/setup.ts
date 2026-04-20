/**
 * Global Test Setup
 *
 * This file is loaded before all test files to configure common mocks
 * and suppress noisy console output from production modules.
 */

import { vi, beforeEach } from 'vitest'

// Set test environment flag so the logger's built-in safety net can suppress
// output even if the vi.mock below fails to apply for any reason.
process.env.VITEST = 'true'

// Suppress console.error in tests to prevent stderr noise from expected errors.
// This is a safety net: even if the vi.mock below fails to intercept the logger
// module (e.g., due to path resolution differences across vitest versions),
// the console methods are still silenced.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// Mock logger globally to suppress console output in tests.
// Individual tests can still import the mocked logger to assert on calls.
//
// Uses the @main alias (defined in vitest.config.ts resolve.alias) for
// reliable resolution regardless of calling file location.
vi.mock('@main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
  LogLevel: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}))

// Also mock with relative path for compatibility with different vitest versions
vi.mock('../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
  LogLevel: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}))
