import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileSystemProvider } from '../../src/main/services/datasource/providers/file-system-provider'
import type { FileManager } from '../../src/main/services/file-manager'

function createMockFileManager() {
  return {
    readFile: vi.fn(async () => ({ content: 'file content', encoding: 'utf-8', size: 12, path: '/test.md' })),
    listFiles: vi.fn(async () => [
      { name: 'test.md', path: 'test.md', isDirectory: false, size: 100, modifiedTime: '2026-01-01', createdTime: '2026-01-01' },
    ]),
    getWorkspaceRoot: vi.fn(() => '/workspace'),
  } as unknown as FileManager
}

describe('FileSystemProvider', () => {
  let provider: FileSystemProvider
  let fileManager: ReturnType<typeof createMockFileManager>

  beforeEach(() => {
    fileManager = createMockFileManager()
    provider = new FileSystemProvider(fileManager, '/workspace')
  })

  it('has correct metadata', () => {
    expect(provider.id).toBe('filesystem')
    expect(provider.name).toBe('Workspace File System')
    expect(provider.capabilities).toContain('fetch')
    expect(provider.capabilities).toContain('list')
  })

  it('is always healthy', async () => {
    expect(await provider.isHealthy()).toBe(true)
  })

  it('fetches a file within workspace', async () => {
    const result = await provider.query({
      operation: 'fetch',
      params: { path: 'test.md' },
    })

    expect(result.data).toEqual({ path: 'test.md', content: 'file content' })
    expect(result.providerId).toBe('filesystem')
    expect(result.fromCache).toBe(false)
  })

  it('throws for path outside workspace boundary', async () => {
    await expect(
      provider.query({ operation: 'fetch', params: { path: '../../../etc/passwd' } }),
    ).rejects.toThrow('Path outside workspace boundary')
  })

  it('lists directory contents', async () => {
    const result = await provider.query({
      operation: 'list',
      params: { path: '.' },
    })

    expect(result.data).toHaveProperty('entries')
    expect(result.providerId).toBe('filesystem')
  })

  it('throws for unsupported operation', async () => {
    await expect(
      provider.query({ operation: 'write', params: { path: 'test.md' } }),
    ).rejects.toThrow('Unsupported operation')
  })

  it('initializes and disposes without error', async () => {
    await expect(provider.initialize({})).resolves.toBeUndefined()
    await expect(provider.dispose()).resolves.toBeUndefined()
  })
})
