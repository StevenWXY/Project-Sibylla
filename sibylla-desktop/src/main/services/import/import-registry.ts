/**
 * Import Registry
 *
 * Adapter registration and format detection for the import pipeline.
 * Supports runtime dynamic registration for future plugin extensibility.
 */

import * as path from 'path'
import * as fs from 'fs'
import type { ImportAdapter } from './types'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[ImportRegistry]'

export class ImportRegistry {
  private adapters: ImportAdapter[] = []

  register(adapter: ImportAdapter): void {
    this.adapters.push(adapter)
    logger.debug(`${LOG_PREFIX} Adapter registered`, { name: adapter.name })
  }

  async detectAdapter(input: string): Promise<ImportAdapter | null> {
    const candidates = this.filterByExtension(input)

    for (const adapter of candidates) {
      try {
        const matched = await adapter.detect(input)
        if (matched) {
          logger.info(`${LOG_PREFIX} Adapter detected`, {
            name: adapter.name,
            input,
          })
          return adapter
        }
      } catch (error) {
        logger.warn(`${LOG_PREFIX} Adapter detect() threw`, {
          name: adapter.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info(`${LOG_PREFIX} No adapter matched`, { input })
    return null
  }

  private filterByExtension(input: string): ImportAdapter[] {
    const ext = path.extname(input).toLowerCase()
    const stat = this.safeStatSync(input)
    const isDirectory = stat?.isDirectory() ?? false

    if (ext === '.zip') {
      return this.adapters.filter(
        (a) => a.name === 'notion' || a.name === 'google-docs'
      )
    }

    if (isDirectory) {
      return this.adapters.filter(
        (a) => a.name === 'obsidian' || a.name === 'markdown'
      )
    }

    if (ext === '.docx') {
      return this.adapters.filter((a) => a.name === 'docx')
    }

    return this.adapters
  }

  private safeStatSync(input: string): fs.Stats | null {
    try {
      return fs.statSync(input)
    } catch {
      return null
    }
  }

  static createDefault(): ImportRegistry {
    const registry = new ImportRegistry()

    const { NotionAdapter } = require('./adapters/notion-adapter') as {
      NotionAdapter: new () => ImportAdapter
    }
    const { GoogleDocsAdapter } = require('./adapters/google-docs-adapter') as {
      GoogleDocsAdapter: new () => ImportAdapter
    }
    const { ObsidianAdapter } = require('./adapters/obsidian-adapter') as {
      ObsidianAdapter: new () => ImportAdapter
    }
    const { MarkdownAdapter } = require('./adapters/markdown-adapter') as {
      MarkdownAdapter: new () => ImportAdapter
    }
    const { DocxAdapter } = require('./adapters/docx-adapter') as {
      DocxAdapter: new () => ImportAdapter
    }

    registry.register(new NotionAdapter())
    registry.register(new GoogleDocsAdapter())
    registry.register(new ObsidianAdapter())
    registry.register(new MarkdownAdapter())
    registry.register(new DocxAdapter())

    logger.info(`${LOG_PREFIX} Default registry created with 5 adapters`)
    return registry
  }
}

export function createImportRegistry(): ImportRegistry {
  return ImportRegistry.createDefault()
}
