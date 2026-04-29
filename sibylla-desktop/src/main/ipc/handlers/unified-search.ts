import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { UnifiedSearchQuery, UnifiedSearchResponse, SearchSource } from '../../services/unified-search/types'
import type { LocalSearchEngine } from '../../services/local-search-engine'
import { logger } from '../../utils/logger'

export class UnifiedSearchHandler extends IpcHandler {
  readonly namespace = 'unified-search'

  constructor(
    private readonly getUnifiedSearch: () => UnifiedSearchEngineHolder | null,
    private readonly localSearchEngine: LocalSearchEngine,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.SEARCH_UNIFIED_QUERY,
      this.safeHandle(this.handleUnifiedQuery.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SEARCH_UNIFIED_LIST_SOURCES,
      this.safeHandle(this.handleListSources.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SEARCH_FUZZY_FILES,
      this.safeHandle(this.handleFuzzyFiles.bind(this)),
    )

    logger.info('[UnifiedSearchHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.SEARCH_UNIFIED_QUERY)
    ipcMain.removeHandler(IPC_CHANNELS.SEARCH_UNIFIED_LIST_SOURCES)
    ipcMain.removeHandler(IPC_CHANNELS.SEARCH_FUZZY_FILES)
    logger.info('[UnifiedSearchHandler] Cleanup completed')
  }

  private async handleUnifiedQuery(
    _event: IpcMainInvokeEvent,
    query: UnifiedSearchQuery,
  ): Promise<UnifiedSearchResponse> {
    const engine = this.getUnifiedSearch()
    if (!engine) throw new Error('UnifiedSearchEngine not initialized')
    return engine.search(query)
  }

  private async handleListSources(
    _event: IpcMainInvokeEvent,
  ): Promise<SearchSource[]> {
    const engine = this.getUnifiedSearch()
    if (!engine) throw new Error('UnifiedSearchEngine not initialized')
    return engine.listSources()
  }

  private async handleFuzzyFiles(
    _event: IpcMainInvokeEvent,
    query: string,
    options?: { limit?: number },
  ): Promise<Array<{ path: string; title: string }>> {
    const results = this.localSearchEngine.search({
      query,
      limit: options?.limit ?? 20,
    })
    return results.map(r => ({
      path: r.path,
      title: r.path.split('/').pop() ?? r.path,
    }))
  }
}

export interface UnifiedSearchEngineHolder {
  search(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse>
  listSources(): SearchSource[]
}
