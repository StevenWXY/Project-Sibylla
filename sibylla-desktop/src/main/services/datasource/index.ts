export type {
  DataSourceOperation,
  DataSourceQuery,
  DataSourceResult,
  DataSourceProvider,
  ProviderConfig,
  ConfigField,
  ProviderManifest,
  ProviderStatus,
} from './types'

export { RateLimitError, QuotaExhaustedError } from './types'
export { RateLimiter } from './rate-limiter'
export { DataSourceRegistry } from './data-source-registry'
export { FileSystemProvider } from './providers/file-system-provider'
export { WorkspaceSearchProvider } from './providers/workspace-search-provider'

import type { ProviderManifest } from './types'

export const FILESYSTEM_MANIFEST: ProviderManifest = {
  id: 'filesystem',
  name: 'Workspace File System',
  version: '1.0.0',
  capabilities: ['fetch', 'list'],
  configSchema: {},
  rateLimits: { requestsPerMinute: 120 },
  defaultCacheTTLSeconds: 60,
}

export const WORKSPACE_SEARCH_MANIFEST: ProviderManifest = {
  id: 'workspace-search',
  name: 'Workspace Search',
  version: '1.0.0',
  capabilities: ['search'],
  configSchema: {},
  rateLimits: { requestsPerMinute: 30 },
  defaultCacheTTLSeconds: 300,
}
