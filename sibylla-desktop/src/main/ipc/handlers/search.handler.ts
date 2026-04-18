import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { SearchQueryParams, SearchIndexStatus } from '../../../shared/types'
import type { LocalSearchEngine } from '../../services/local-search-engine'

export class SearchHandler extends IpcHandler {
  readonly namespace = 'search'
  private localSearchEngine: LocalSearchEngine | null = null

  constructor(localSearchEngine: LocalSearchEngine) {
    super()
    this.localSearchEngine = localSearchEngine
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.SEARCH_QUERY,
      this.safeHandle(this.handleSearchQuery.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SEARCH_INDEX_STATUS,
      this.safeHandle(this.handleIndexStatus.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SEARCH_REINDEX,
      this.safeHandle(this.handleReindex.bind(this)),
    )

    console.log('[SearchHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.SEARCH_QUERY)
    ipcMain.removeHandler(IPC_CHANNELS.SEARCH_INDEX_STATUS)
    ipcMain.removeHandler(IPC_CHANNELS.SEARCH_REINDEX)
    console.log('[SearchHandler] Cleanup completed')
  }

  private async handleSearchQuery(
    _event: IpcMainInvokeEvent,
    params: SearchQueryParams,
  ) {
    if (!this.localSearchEngine) {
      throw new Error('LocalSearchEngine not initialized')
    }
    return this.localSearchEngine.search(params)
  }

  private async handleIndexStatus(
    _event: IpcMainInvokeEvent,
  ): Promise<SearchIndexStatus> {
    if (!this.localSearchEngine) {
      throw new Error('LocalSearchEngine not initialized')
    }
    return this.localSearchEngine.getIndexStatus()
  }

  private async handleReindex(_event: IpcMainInvokeEvent): Promise<void> {
    if (!this.localSearchEngine) {
      throw new Error('LocalSearchEngine not initialized')
    }
    await this.localSearchEngine.rebuildIndex()
  }
}
