import type {
  AIChatRequest,
  AIChatResponse,
  AuthLoginInput,
  AuthRegisterInput,
  AuthSession,
  AuthUser,
  ConflictInfo,
  ConflictResolution,
  FileContent,
  FileInfo,
  FileWatchEvent,
  IPCChannel,
  IPCResponse,
  ListFilesOptions,
  SyncStatusData,
  SyncResult,
  WorkspaceConfig,
  WorkspaceInfo,
  WorkspaceMetadata,
  WorkspaceMember,
  InviteRequest,
  InviteResult,
  MemberRole,
} from '../../shared/types'
import type { CommitInfo, FileDiff } from '../../shared/types/git.types'
import { ErrorType } from '../../shared/types'
import type { ElectronAPI } from '../../preload/index'

const MOCK_USER: AuthUser = {
  id: 'mock-user-1',
  email: 'demo@sibylla.ai',
  name: 'Sibylla Demo',
}

const MOCK_MEMBERS: WorkspaceMember[] = [
  {
    id: 'mock-user-1',
    name: 'Sibylla Demo',
    email: 'demo@sibylla.ai',
    role: 'admin',
    joinedAt: new Date().toISOString(),
  },
  {
    id: 'mock-user-2',
    name: 'Alice Editor',
    email: 'alice@example.com',
    role: 'editor',
    joinedAt: new Date().toISOString(),
  },
  {
    id: 'mock-user-3',
    name: 'Bob Viewer',
    email: 'bob@example.com',
    role: 'viewer',
    joinedAt: new Date().toISOString(),
  },
]

const MOCK_WORKSPACE_CONFIG: WorkspaceConfig = {
  workspaceId: 'ws-sibylla-demo',
  name: 'Sibylla-Core',
  description: 'Sibylla Dark Mockup Workspace',
  icon: '🧠',
  defaultModel: 'claude-3.5-sonnet',
  syncInterval: 30,
  createdAt: new Date().toISOString(),
  gitProvider: 'sibylla',
  gitRemote: null,
  lastSyncAt: new Date().toISOString(),
}

const MOCK_FILES = new Map<string, string>([
  [
    'ui-ux-design.md',
    `# UI/UX Design Specification

> This document defines the interface layout, visual specifications, and interaction design principles for Sibylla.  
> All UI designs must adhere to the UI/UX baselines in CLAUDE.md.

## 1. Design Principles`,
  ],
  [
    'prd.md',
    `# Product Requirements Document

- [ ] Define clear user personas
- [ ] Complete task decomposition
- [ ] Ship Studio V1`,
  ],
  [
    'app.ts',
    `export const appVersion = '0.1.0'

export function bootstrap() {
  console.log('Sibylla desktop app bootstrapped')
}`,
  ],
])

const fileWatchListeners = new Set<(event: FileWatchEvent) => void>()
const syncListeners = new Set<(data: SyncStatusData) => void>()
const channelListeners = new Map<IPCChannel, Set<(...args: unknown[]) => void>>()

let currentWorkspacePath = '/Users/dd/Documents/Playground/Project-Sibylla'
let currentWorkspace: WorkspaceInfo = buildWorkspaceInfo(currentWorkspacePath)

function byteLength(content: string): number {
  return new TextEncoder().encode(content).length
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\/+/, '')
}

function splitPath(input: string): string[] {
  const normalized = normalizePath(input)
  return normalized.split('/').filter(Boolean)
}

function getExtension(path: string): string | undefined {
  const filename = path.split('/').pop() ?? ''
  const index = filename.lastIndexOf('.')
  if (index <= 0 || index === filename.length - 1) {
    return undefined
  }
  return filename.slice(index + 1)
}

function buildWorkspaceInfo(path: string): WorkspaceInfo {
  const metadata: WorkspaceMetadata = {
    path,
    sizeBytes: Array.from(MOCK_FILES.values()).reduce((sum, content) => sum + byteLength(content), 0),
    fileCount: MOCK_FILES.size,
    lastModifiedAt: nowIso(),
    isSyncing: false,
    hasUncommittedChanges: true,
  }

  return {
    config: {
      ...MOCK_WORKSPACE_CONFIG,
      lastSyncAt: nowIso(),
    },
    metadata,
  }
}

function ok<T>(data: T): IPCResponse<T> {
  return { success: true, data, timestamp: Date.now() }
}

function errorResponse(message: string): IPCResponse<never> {
  return {
    success: false,
    error: { type: ErrorType.IPC_ERROR, message },
    timestamp: Date.now(),
  }
}

function emitFileWatch(event: FileWatchEvent): void {
  for (const listener of fileWatchListeners) {
    listener(event)
  }
}

function emitSync(status: SyncStatusData): void {
  for (const listener of syncListeners) {
    listener(status)
  }
}

function listAllPaths(): { path: string; isDirectory: boolean }[] {
  const directorySet = new Set<string>()
  const fileEntries: { path: string; isDirectory: boolean }[] = []

  for (const filePath of MOCK_FILES.keys()) {
    const parts = splitPath(filePath)
    for (let index = 1; index < parts.length; index += 1) {
      directorySet.add(parts.slice(0, index).join('/'))
    }
    fileEntries.push({ path: filePath, isDirectory: false })
  }

  const directories = Array.from(directorySet).map((path) => ({ path, isDirectory: true }))
  return [...directories, ...fileEntries]
}

function isDescendant(parent: string, candidate: string): boolean {
  if (!parent) {
    return true
  }
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

function isImmediateChild(parent: string, candidate: string): boolean {
  if (!isDescendant(parent, candidate) || parent === candidate) {
    return false
  }
  const parentDepth = splitPath(parent).length
  const candidateDepth = splitPath(candidate).length
  return candidateDepth === parentDepth + 1
}

function toFileInfo(path: string, isDirectory: boolean): FileInfo {
  const parts = splitPath(path)
  const name = parts.at(-1) ?? path
  const content = isDirectory ? '' : MOCK_FILES.get(path) ?? ''
  const extension = isDirectory ? undefined : getExtension(path)

  return {
    name,
    path,
    isDirectory,
    size: byteLength(content),
    modifiedTime: nowIso(),
    createdTime: nowIso(),
    extension,
  }
}

function listFiles(path: string, options?: ListFilesOptions): FileInfo[] {
  const target = normalizePath(path)
  const recursive = Boolean(options?.recursive)

  return listAllPaths()
    .filter((entry) =>
      recursive ? isDescendant(target, entry.path) && entry.path !== target : isImmediateChild(target, entry.path)
    )
    .map((entry) => toFileInfo(entry.path, entry.isDirectory))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.path.localeCompare(b.path)
    })
}

function movePath(sourcePath: string, targetPath: string): void {
  const source = normalizePath(sourcePath)
  const target = normalizePath(targetPath)

  if (MOCK_FILES.has(source)) {
    const content = MOCK_FILES.get(source) ?? ''
    MOCK_FILES.delete(source)
    MOCK_FILES.set(target, content)
    emitFileWatch({ type: 'unlink', path: source })
    emitFileWatch({ type: 'add', path: target })
    return
  }

  const affected = Array.from(MOCK_FILES.keys()).filter((filePath) => filePath.startsWith(`${source}/`))
  for (const oldPath of affected) {
    const content = MOCK_FILES.get(oldPath) ?? ''
    const newPath = oldPath.replace(source, target)
    MOCK_FILES.delete(oldPath)
    MOCK_FILES.set(newPath, content)
    emitFileWatch({ type: 'unlink', path: oldPath })
    emitFileWatch({ type: 'add', path: newPath })
  }
}

function removePath(path: string): void {
  const target = normalizePath(path)
  if (MOCK_FILES.delete(target)) {
    emitFileWatch({ type: 'unlink', path: target })
    return
  }

  for (const filePath of Array.from(MOCK_FILES.keys())) {
    if (filePath.startsWith(`${target}/`)) {
      MOCK_FILES.delete(filePath)
      emitFileWatch({ type: 'unlink', path: filePath })
    }
  }
}

function createAIResponse(request: AIChatRequest | string): AIChatResponse {
  const content =
    typeof request === 'string'
      ? request
      : request.message

  return {
    id: `mock-ai-${Date.now()}`,
    model: 'claude-3.5-sonnet',
    provider: 'mock',
    content:
      `Sure, retrieved \`Sibylla_VI_Design_System.html\`.\n` +
      `It is recommended to use a dark gray panel with warning colors.\n` +
      `I have generated a Diff preview for this request:\n\n` +
      `- ${content.slice(0, 120)}`,
    usage: {
      inputTokens: 320,
      outputTokens: 136,
      totalTokens: 456,
      estimatedCostUsd: 0.0021,
    },
    intercepted: true,
    warnings: [],
    ragHits: [],
    memory: {
      tokenCount: 456,
      tokenDebt: 0,
      flushTriggered: false,
    },
  }
}

function createMockAPI(): ElectronAPI {
  return {
    ping: async () => ok('pong'),
    echo: async (message: string) => ok(message),
    getSystemInfo: async () =>
      ok({
        platform: 'darwin',
        arch: 'arm64',
        version: '0.1.0',
        electronVersion: '28.3.3',
        chromeVersion: '120.0.0.0',
        nodeVersion: '20.11.0',
      }),
    getPlatform: async () => ok('darwin'),
    getVersion: async () => ok('0.1.0'),
    file: {
      read: async (path: string) => {
        const target = normalizePath(path)
        const content = MOCK_FILES.get(target)
        if (content == null) {
          return errorResponse(`File not found: ${target}`)
        }
        const payload: FileContent = {
          path: target,
          content,
          encoding: 'utf-8',
          size: byteLength(content),
        }
        return ok(payload)
      },
      write: async (path: string, content: string) => {
        const target = normalizePath(path)
        const existed = MOCK_FILES.has(target)
        MOCK_FILES.set(target, content)
        emitFileWatch({ type: existed ? 'change' : 'add', path: target })
        currentWorkspace = buildWorkspaceInfo(currentWorkspacePath)
        return ok(undefined)
      },
      delete: async (path: string) => {
        removePath(path)
        currentWorkspace = buildWorkspaceInfo(currentWorkspacePath)
        return ok(undefined)
      },
      copy: async (sourcePath: string, destPath: string) => {
        const source = normalizePath(sourcePath)
        const target = normalizePath(destPath)
        const content = MOCK_FILES.get(source)
        if (content == null) {
          return errorResponse(`Source file not found: ${source}`)
        }
        MOCK_FILES.set(target, content)
        emitFileWatch({ type: 'add', path: target })
        currentWorkspace = buildWorkspaceInfo(currentWorkspacePath)
        return ok(undefined)
      },
      move: async (sourcePath: string, destPath: string) => {
        movePath(sourcePath, destPath)
        currentWorkspace = buildWorkspaceInfo(currentWorkspacePath)
        return ok(undefined)
      },
      list: async (path: string, options?: ListFilesOptions) => ok(listFiles(path, options)),
      getInfo: async (path: string) => {
        const target = normalizePath(path)
        if (MOCK_FILES.has(target)) {
          return ok(toFileInfo(target, false))
        }
        const hasChildren = Array.from(MOCK_FILES.keys()).some((filePath) => filePath.startsWith(`${target}/`))
        if (hasChildren) {
          return ok(toFileInfo(target, true))
        }
        return errorResponse(`Path not found: ${target}`)
      },
      exists: async (path: string) => {
        const target = normalizePath(path)
        const exists =
          MOCK_FILES.has(target) || Array.from(MOCK_FILES.keys()).some((filePath) => filePath.startsWith(`${target}/`))
        return ok(exists)
      },
      createDir: async () => ok(undefined),
      deleteDir: async (path: string) => {
        removePath(path)
        currentWorkspace = buildWorkspaceInfo(currentWorkspacePath)
        return ok(undefined)
      },
      startWatching: async () => ok(undefined),
      stopWatching: async () => ok(undefined),
      onFileChange: (callback: (event: FileWatchEvent) => void) => {
        fileWatchListeners.add(callback)
        return () => {
          fileWatchListeners.delete(callback)
        }
      },
    },
    workspace: {
      create: async (options) => {
        currentWorkspacePath = options.path
        currentWorkspace = {
          config: {
            ...MOCK_WORKSPACE_CONFIG,
            name: options.name,
            description: options.description,
            workspaceId: `ws-${Date.now()}`,
          },
          metadata: {
            ...buildWorkspaceInfo(options.path).metadata,
            path: options.path,
          },
        }
        return ok(currentWorkspace)
      },
      open: async (path: string) => {
        currentWorkspacePath = path
        currentWorkspace = buildWorkspaceInfo(path)
        return ok(currentWorkspace)
      },
      close: async () => ok(undefined),
      getCurrent: async () => ok(currentWorkspace),
      validate: async () => ok(true),
      selectFolder: async () => ok('/Users/dd/Documents/Playground/Project-Sibylla'),
      getConfig: async () => ok(currentWorkspace.config),
      updateConfig: async (updates) => {
        currentWorkspace = {
          ...currentWorkspace,
          config: {
            ...currentWorkspace.config,
            ...updates,
          },
        }
        return ok(undefined)
      },
      getMetadata: async () => ok(currentWorkspace.metadata),
      getMembers: async (_workspaceId: string) => ok<WorkspaceMember[]>(MOCK_MEMBERS),
      inviteMember: async (_workspaceId: string, _request: InviteRequest) => ok<InviteResult>({ success: true }),
      updateMemberRole: async (_workspaceId: string, _userId: string, _role: MemberRole) => ok(undefined),
      removeMember: async (_workspaceId: string, _userId: string) => ok(undefined),
    },
    sync: {
      force: async () => {
        const result: SyncResult = { success: true, hasConflicts: false, conflicts: [] }
        emitSync({ status: 'synced', timestamp: Date.now() })
        return ok(result)
      },
      getState: async () => {
        return ok({ status: 'synced' as const, timestamp: Date.now() })
      },
      onStatusChange: (callback: (data: SyncStatusData) => void) => {
        syncListeners.add(callback)
        window.setTimeout(() => {
          callback({ status: 'synced', timestamp: Date.now() })
        }, 50)
        return () => {
          syncListeners.delete(callback)
        }
      },
    },
    git: {
      getConflicts: async () => ok<ConflictInfo[]>([]),
      resolve: async (_resolution: ConflictResolution) => ok(`mock-oid-${Date.now()}`),
      onConflictDetected: (_callback: (conflicts: ConflictInfo[]) => void) => () => {},
      history: async () => ok<readonly CommitInfo[]>([
        {
          oid: 'mock-commit-001',
          message: '更新 prd.md',
          authorName: 'Demo User',
          authorEmail: 'demo@sibylla.ai',
          timestamp: Date.now() - 3 * 60 * 1000,
          parents: ['mock-commit-000'],
        },
        {
          oid: 'mock-commit-000',
          message: 'Initial commit: workspace created',
          authorName: 'Demo User',
          authorEmail: 'demo@sibylla.ai',
          timestamp: Date.now() - 24 * 60 * 60 * 1000,
          parents: [],
        },
      ]),
      diff: async () => ok<FileDiff>({
        filepath: 'prd.md',
        oldContent: '# Product Requirements Document\n- [ ] Define clear user personas',
        newContent: '# Product Requirements Document\n- [ ] Define clear user personas\n- [ ] Complete task decomposition',
        hunks: [
          {
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 3,
            lines: [
              { type: 'context', content: '# Product Requirements Document' },
              { type: 'context', content: '- [ ] Define clear user personas' },
              { type: 'add', content: '- [ ] Complete task decomposition' },
            ],
          },
        ],
      }),
      restore: async () => ok(`mock-restore-oid-${Date.now()}`),
    },
    ai: {
      chat: async (request) => ok(createAIResponse(request)),
      stream: async (request) => ok(createAIResponse(request)),
      embed: async () => ok({ model: 'mock-embedding', vector: Array.from({ length: 12 }, () => Math.random()) }),
    },
    auth: {
      login: async (_input: AuthLoginInput) => ok<AuthSession>({ isAuthenticated: true, user: MOCK_USER }),
      register: async (_input: AuthRegisterInput) => ok<AuthSession>({ isAuthenticated: true, user: MOCK_USER }),
      logout: async () => ok(undefined),
      getCurrentUser: async () => ok<AuthSession>({ isAuthenticated: true, user: MOCK_USER }),
      refreshToken: async () => ok<AuthSession>({ isAuthenticated: true, user: MOCK_USER }),
    },
    window: {
      minimize: async () => ok(undefined),
      maximize: async () => ok(false),
      close: async () => ok(undefined),
      toggleFullscreen: async () => ok(false),
    },
    on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
      if (!channelListeners.has(channel)) {
        channelListeners.set(channel, new Set())
      }
      channelListeners.get(channel)?.add(callback)
      return () => {
        channelListeners.get(channel)?.delete(callback)
      }
    },
    off: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
      channelListeners.get(channel)?.delete(callback)
    },
  }
}

export function installRendererElectronMock(): void {
  if (typeof window === 'undefined') {
    return
  }

  if (window.electronAPI) {
    return
  }

  window.electronAPI = createMockAPI()
  console.info('[MockElectronAPI] Browser fallback active for renderer-only preview.')
}
