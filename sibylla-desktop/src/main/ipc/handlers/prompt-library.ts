import * as fs from 'fs'
import * as path from 'path'
import type { PromptMetadata, PromptContent, PromptValidationResult } from '../../../shared/types'
import { IPC_CHANNELS } from '../../../shared/types'
import type { PromptLoader } from '../../services/context-engine/PromptLoader'
import type { PromptRegistry } from '../../services/context-engine/PromptRegistry'
import type { PromptComposer } from '../../services/context-engine/PromptComposer'
import { estimateTokens } from '../../services/context-engine/token-utils'
import { logger } from '../../utils/logger'

export function registerPromptLibraryHandlers(
  ipcMainInstance: Electron.IpcMain,
  loader: PromptLoader,
  registry: PromptRegistry,
  composer: PromptComposer,
  getWorkspaceRoot: () => string | null,
): () => void {
  const handlers: Array<{ channel: string; handler: (...args: unknown[]) => Promise<unknown> }> = [
    {
      channel: IPC_CHANNELS.PROMPT_LIBRARY_LIST_ALL,
      handler: async (): Promise<PromptMetadata[]> => {
        return registry.getAll()
      },
    },
    {
      channel: IPC_CHANNELS.PROMPT_LIBRARY_READ,
      handler: async (id: unknown): Promise<PromptContent> => {
        if (typeof id !== 'string') throw new Error('id must be a string')
        const result = await loader.load(id)
        const metadata = registry.get(id)
        if (!metadata) throw new Error(`Prompt not found: ${id}`)
        return {
          metadata,
          body: result.body,
          rawFrontmatter: JSON.stringify(result.rawFrontmatter),
        }
      },
    },
    {
      channel: IPC_CHANNELS.PROMPT_LIBRARY_DERIVE_USER_COPY,
      handler: async (id: unknown): Promise<{ userPath: string }> => {
        if (typeof id !== 'string') throw new Error('id must be a string')
        const workspaceRoot = getWorkspaceRoot()
        if (!workspaceRoot) throw new Error('No workspace open')

        const userPath = loader.resolveUserPath(id)
        const userDir = path.dirname(userPath)
        await fs.promises.mkdir(userDir, { recursive: true })

        const builtinPath = loader.resolveBuiltinPath(id)
        const content = await fs.promises.readFile(builtinPath, 'utf-8')
        await fs.promises.writeFile(userPath, content, 'utf-8')

        await registry.refreshOverride(id)
        composer.invalidateCache(id)

        logger.info('[PromptLibrary] Derived user copy', { id, userPath })
        return { userPath }
      },
    },
    {
      channel: IPC_CHANNELS.PROMPT_LIBRARY_RESET_USER_OVERRIDE,
      handler: async (id: unknown): Promise<void> => {
        if (typeof id !== 'string') throw new Error('id must be a string')
        const userPath = loader.resolveUserPath(id)
        try {
          await fs.promises.unlink(userPath)
        } catch {
          // File may not exist
        }
        registry.removeOverride(id)
        composer.invalidateCache(id)
        logger.info('[PromptLibrary] Reset user override', { id })
      },
    },
    {
      channel: IPC_CHANNELS.PROMPT_LIBRARY_VALIDATE,
      handler: async (id: unknown, content: unknown): Promise<PromptValidationResult> => {
        if (typeof id !== 'string') throw new Error('id must be a string')
        if (typeof content !== 'string') throw new Error('content must be a string')
        return registry.validate(id, content)
      },
    },
    {
      channel: IPC_CHANNELS.PROMPT_LIBRARY_ESTIMATE_TOKENS,
      handler: async (content: unknown): Promise<number> => {
        if (typeof content !== 'string') throw new Error('content must be a string')
        return estimateTokens(content)
      },
    },
  ]

  for (const { channel, handler } of handlers) {
    ipcMainInstance.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return await handler(...args)
      } catch (error) {
        logger.error('[PromptLibrary] IPC handler error', {
          channel,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  }

  return () => {
    for (const { channel } of handlers) {
      ipcMainInstance.removeHandler(channel)
    }
  }
}
