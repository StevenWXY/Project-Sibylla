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
