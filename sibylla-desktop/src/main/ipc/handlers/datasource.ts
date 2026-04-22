import type { DataSourceRegistry } from '../../services/datasource/data-source-registry'
import type { DataSourceQuery } from '../../services/datasource/types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerDatasourceHandlers(
  ipcMainInstance: Electron.IpcMain,
  dataSourceRegistry: DataSourceRegistry,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.DATASOURCE_LIST_PROVIDERS,
    async () => {
      try {
        return dataSourceRegistry.listProviders()
      } catch (error) {
        logger.error('datasource.ipc.listProviders.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.DATASOURCE_QUERY,
    async (_event, providerId: string, query: DataSourceQuery) => {
      try {
        return await dataSourceRegistry.query(providerId, query)
      } catch (error) {
        logger.error('datasource.ipc.query.error', {
          providerId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.DATASOURCE_GET_PROVIDER_STATUS,
    async (_event, id: string) => {
      try {
        return dataSourceRegistry.getProviderStatus(id)
      } catch (error) {
        logger.error('datasource.ipc.getProviderStatus.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.DATASOURCE_LIST_PROVIDERS)
    ipcMainInstance.removeHandler(IPC_CHANNELS.DATASOURCE_QUERY)
    ipcMainInstance.removeHandler(IPC_CHANNELS.DATASOURCE_GET_PROVIDER_STATUS)
  }
}
