import type { LocalSearchEngine } from '../../local-search-engine'
import type { DataSourceProvider, DataSourceQuery, DataSourceResult, ProviderConfig } from '../types'

export class WorkspaceSearchProvider implements DataSourceProvider {
  readonly id = 'workspace-search'
  readonly name = 'Workspace Search'
  readonly version = '1.0.0'
  readonly capabilities: readonly import('../types').DataSourceOperation[] = ['search']

  constructor(
    private localSearchEngine: LocalSearchEngine,
  ) {}

  async initialize(_config: ProviderConfig): Promise<void> {}

  async isHealthy(): Promise<boolean> {
    return true
  }

  async query(q: DataSourceQuery): Promise<DataSourceResult> {
    if (q.operation !== 'search') {
      throw new Error(`Unsupported operation: ${q.operation}`)
    }

    const query = (q.params['query'] as string) ?? ''
    const limit = (q.params['limit'] as number) ?? 20
    const fileExtensions = q.params['fileExtensions'] as string[] | undefined

    const results = this.localSearchEngine.search({ query, limit, fileExtensions })

    return {
      data: { results },
      fromCache: false,
      fetchedAt: new Date().toISOString(),
      providerId: this.id,
    }
  }

  async dispose(): Promise<void> {}
}
