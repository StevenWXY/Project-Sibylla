/**
 * Test setup for renderer (React) component tests
 * Configures jsdom environment and testing-library matchers
 */

import '@testing-library/jest-dom'

// Mock window.electronAPI for renderer tests
const mockElectronAPI = {
  ping: vi.fn(),
  echo: vi.fn(),
  getSystemInfo: vi.fn(),
  getPlatform: vi.fn(),
  getVersion: vi.fn(),
  file: {
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
    move: vi.fn(),
    list: vi.fn(),
    getInfo: vi.fn(),
    exists: vi.fn(),
    createDir: vi.fn(),
    deleteDir: vi.fn(),
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
    onFileChange: vi.fn(() => vi.fn()),
  },
  workspace: {
    create: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    getCurrent: vi.fn(),
    validate: vi.fn(),
    selectFolder: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    getMetadata: vi.fn(),
  },
  sync: {
    force: vi.fn(),
    onStatusChange: vi.fn(() => vi.fn()),
  },
  auth: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    refreshToken: vi.fn(),
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    toggleFullscreen: vi.fn(),
  },
  on: vi.fn(() => vi.fn()),
  off: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})

// Mock matchMedia for ThemeProvider
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Reset all mocks between tests
afterEach(() => {
  vi.clearAllMocks()
})
