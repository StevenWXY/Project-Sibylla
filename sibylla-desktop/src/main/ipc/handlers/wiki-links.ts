import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { WikiLinksIndexer } from '../../services/wiki-links/wiki-links-indexer'
import type { WikiLinksStore } from '../../services/wiki-links/wiki-links-store'

export class WikiLinksHandler extends IpcHandler {
  readonly namespace = 'wiki-links'

  constructor(
    private readonly indexer: WikiLinksIndexer,
    private readonly store: WikiLinksStore,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_GET_BACKLINKS,
      this.safeHandle(this.handleGetBacklinks.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_GET_OUTLINKS,
      this.safeHandle(this.handleGetOutlinks.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_GET_GRAPH_DATA,
      this.safeHandle(this.handleGetGraphData.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_REBUILD_INDEX,
      this.safeHandle(this.handleRebuildIndex.bind(this)),
    )
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_GET_BACKLINKS)
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_GET_OUTLINKS)
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_GET_GRAPH_DATA)
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_REBUILD_INDEX)
  }

  private async handleGetBacklinks(
    _event: IpcMainInvokeEvent,
    targetPath: string,
  ) {
    return this.store.getBacklinks(targetPath)
  }

  private async handleGetOutlinks(
    _event: IpcMainInvokeEvent,
    sourcePath: string,
  ) {
    return this.store.getOutlinks(sourcePath)
  }

  private async handleGetGraphData(
    _event: IpcMainInvokeEvent,
    centerPath?: string,
  ) {
    return this.store.getGraphData(centerPath)
  }

  private async handleRebuildIndex() {
    await this.indexer.rebuildAllIndex()
    return { success: true }
  }
}
