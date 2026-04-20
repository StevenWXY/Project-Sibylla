/**
 * Global Test Setup
 *
 * This file is loaded before all test files to configure common mocks
 * and suppress noisy console output from production modules.
 */

import { vi } from 'vitest'

// Set test environment flag so the logger's built-in safety net can suppress
// output even if the vi.mock below fails to apply for any reason.
process.env.VITEST = 'true'

// Mock logger globally to suppress console output in tests.
// Individual tests can still import the mocked logger to assert on calls.
//
// Path resolution: vi.mock resolves paths relative to this file (tests/setup.ts).
// '../src/main/utils/logger' resolves to 'src/main/utils/logger', which matches
// the module imported by production code (e.g., workspace-manager.ts imports
// '../utils/logger' which also resolves to 'src/main/utils/logger').
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
