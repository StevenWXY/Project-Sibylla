import path from 'path'
import type { FileManager } from '../../file-manager'
import type { DataSourceProvider, DataSourceQuery, DataSourceResult, ProviderConfig } from '../types'

export class FileSystemProvider implements DataSourceProvider {
  readonly id = 'filesystem'
  readonly name = 'Workspace File System'
  readonly version = '1.0.0'
  readonly capabilities: readonly import('../types').DataSourceOperation[] = ['fetch', 'list']

  constructor(
    private fileManager: FileManager,
    private workspaceRoot: string,
  ) {}

  async initialize(_config: ProviderConfig): Promise<void> {}

  async isHealthy(): Promise<boolean> {
    return true
  }

  async query(q: DataSourceQuery): Promise<DataSourceResult> {
    switch (q.operation) {
      case 'fetch': {
        const filePath = q.params['path'] as string
        if (!filePath) throw new Error('Missing required param: path')
        this.resolveWithinWorkspace(filePath)
        const result = await this.fileManager.readFile(filePath)
        return {
          data: { path: filePath, content: result.content },
          fromCache: false,
          fetchedAt: new Date().toISOString(),
          providerId: this.id,
        }
      }
      case 'list': {
        const dirPath = (q.params['path'] as string) ?? '/'
        this.resolveWithinWorkspace(dirPath)
        const entries = await this.fileManager.listFiles(dirPath, { recursive: false })
        return {
          data: { path: dirPath, entries },
          fromCache: false,
          fetchedAt: new Date().toISOString(),
          providerId: this.id,
        }
      }
      default:
        throw new Error(`Unsupported operation: ${q.operation}`)
    }
  }

  async dispose(): Promise<void> {}

  private resolveWithinWorkspace(p: string): string {
    const resolved = path.resolve(this.workspaceRoot, p)
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error('Path outside workspace boundary')
    }
    return resolved
  }
}
