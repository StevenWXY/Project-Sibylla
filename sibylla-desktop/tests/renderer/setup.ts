/**
 * Test setup for renderer (React) component tests
 * Configures jsdom environment and testing-library matchers
 */

import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'

const jsdomWindow = window as typeof window & Record<string, unknown>
const domGlobalNames = [
  'Node',
  'Element',
  'HTMLElement',
  'HTMLIFrameElement',
  'SVGElement',
  'ShadowRoot',
  'Document',
  'DocumentFragment',
  'DOMParser',
  'XMLSerializer',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'MutationObserver',
  'Range',
] as const

function restoreDomGlobals() {
  if (globalThis.window !== jsdomWindow) {
    Object.defineProperty(globalThis, 'window', {
      value: jsdomWindow,
      configurable: true,
      writable: true,
    })
  }

  for (const name of domGlobalNames) {
    const value = jsdomWindow[name]
    if (value) {
      Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true,
      })
    }
  }
}

restoreDomGlobals()

function createStorageMock() {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => {
      return store.has(key) ? store.get(key)! : null
    }),
    key: vi.fn((index: number) => {
      const keys = Array.from(store.keys())
      return keys[index] ?? null
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(String(key), String(value))
    }),
  } satisfies Storage
}

const localStorageMock = createStorageMock()
const sessionStorageMock = createStorageMock()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
})

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true,
  writable: true,
})

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
    getMembers: vi.fn(),
    inviteMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
  sync: {
    force: vi.fn(),
    getState: vi.fn(),
    onStatusChange: vi.fn(() => vi.fn()),
  },
  git: {
    getConflicts: vi.fn(),
    resolve: vi.fn(),
    onConflictDetected: vi.fn(() => vi.fn()),
    history: vi.fn(),
    diff: vi.fn(),
    restore: vi.fn(),
  },
  auth: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    refreshToken: vi.fn(),
  },
  app: {
    getConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateConfig: vi.fn().mockResolvedValue({ success: true }),
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    toggleFullscreen: vi.fn(),
  },
  ai: {
    chat: vi.fn(),
    stream: vi.fn().mockReturnValue('mock-stream-id'),
    abortStream: vi.fn(),
    onStreamChunk: vi.fn().mockReturnValue(vi.fn()),
    onStreamEnd: vi.fn().mockReturnValue(vi.fn()),
    onStreamError: vi.fn().mockReturnValue(vi.fn()),
    embed: vi.fn(),
    contextFiles: vi.fn().mockResolvedValue({
      success: true,
      data: [
        { path: 'docs/prd.md', name: 'prd.md', type: 'file' as const, extension: 'md' },
        { path: 'CLAUDE.md', name: 'CLAUDE.md', type: 'file' as const, extension: 'md' },
      ],
      timestamp: Date.now(),
    }),
    skillList: vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 'writing-prd', name: '撰写 PRD', description: '按照产品需求文档标准模板撰写 PRD', scenarios: '产品需求文档撰写' },
        { id: 'writing-design', name: '技术方案撰写', description: '按照技术方案标准模板撰写设计文档', scenarios: '技术方案设计' },
      ],
      timestamp: Date.now(),
    }),
    skillSearch: vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 'writing-prd', name: '撰写 PRD', description: '按照产品需求文档标准模板撰写 PRD', scenarios: '产品需求文档撰写' },
      ],
      timestamp: Date.now(),
    }),
  },
  memory: {
    snapshot: vi.fn().mockResolvedValue({ success: true, data: { content: '', tokenCount: 0, tokenDebt: 0 }, timestamp: Date.now() }),
    update: vi.fn().mockResolvedValue({ success: true, data: { content: '', tokenCount: 0, tokenDebt: 0 }, timestamp: Date.now() }),
    flush: vi.fn().mockResolvedValue({ success: true, data: { triggered: false, thresholdTokens: 0, sessionTokens: 0, snapshot: { content: '', tokenCount: 0, tokenDebt: 0 } }, timestamp: Date.now() }),
    queryDailyLog: vi.fn().mockResolvedValue({ success: true, data: [], timestamp: Date.now() }),
  },
  rag: {
    search: vi.fn().mockResolvedValue({ success: true, data: [], timestamp: Date.now() }),
    rebuild: vi.fn().mockResolvedValue({ success: true, data: undefined, timestamp: Date.now() }),
  },
  search: {
    query: vi.fn().mockResolvedValue({ success: true, data: [], timestamp: Date.now() }),
    indexStatus: vi.fn().mockResolvedValue({ success: true, data: { totalFiles: 0, indexedFiles: 0, indexSizeBytes: 0, lastIndexedAt: null, isIndexing: false }, timestamp: Date.now() }),
    reindex: vi.fn().mockResolvedValue({ success: true, data: undefined, timestamp: Date.now() }),
    onIndexProgress: vi.fn().mockReturnValue(vi.fn()),
  },
  harness: {
    execute: vi.fn(),
    setMode: vi.fn().mockResolvedValue({ success: true }),
    getMode: vi.fn().mockResolvedValue({ success: true, data: 'dual' }),
    listGuardrails: vi.fn().mockResolvedValue({ success: true, data: [] }),
    setGuardrailEnabled: vi.fn().mockResolvedValue({ success: true }),
    onDegradationOccurred: vi.fn().mockReturnValue(vi.fn()),
    listResumeable: vi.fn().mockResolvedValue({ success: true, data: [] }),
    resumeTask: vi.fn().mockResolvedValue({ success: true }),
    abandonTask: vi.fn().mockResolvedValue({ success: true }),
    onResumeableTaskDetected: vi.fn().mockReturnValue(vi.fn()),
    onGuardrailBlocked: vi.fn().mockReturnValue(vi.fn()),
  },
  proactive: {
    pushSnapshot: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateConfig: vi.fn().mockResolvedValue({ success: true }),
    dismissSuggestion: vi.fn().mockResolvedValue({ success: true }),
    acceptSuggestion: vi.fn().mockResolvedValue({ success: true }),
    onSuggestionShown: vi.fn().mockReturnValue(vi.fn()),
  },
  on: vi.fn(() => vi.fn()),
  off: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  configurable: true,
  writable: true,
})

if (process.env.VITEST_DEBUG_HANG === '1') {
  const watchdog = setInterval(() => {
    const internalProcess = process as NodeJS.Process & {
      _getActiveHandles?: () => unknown[]
      _getActiveRequests?: () => unknown[]
    }
    const activeHandles =
      internalProcess
        ._getActiveHandles?.()
        .filter((handle) => {
          const name = (handle as { constructor?: { name?: string } })?.constructor?.name ?? ''
          return !['Socket', 'WriteStream', 'ReadStream'].includes(name)
        }) ?? []
    const activeRequests = internalProcess._getActiveRequests?.() ?? []
    if (activeHandles.length || activeRequests.length) {
      console.warn(
        `[renderer-hang-debug] handles=${activeHandles.length}, requests=${activeRequests.length}`,
        activeHandles.map((h) => (h as { constructor?: { name?: string } })?.constructor?.name ?? 'unknown')
      )
    }
  }, 15000)
  watchdog.unref?.()
}

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
beforeEach(() => {
  restoreDomGlobals()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorageMock.clear()
  sessionStorageMock.clear()
})
