/**
 * Asset Handler
 *
 * Shared image asset processing for all import adapters.
 * Copies images to workspace assets directory and rewrites Markdown paths.
 */

import * as path from 'path'
import * as fs from 'fs'
import type { AssetAttachment, AssetCopyResult } from './types'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[AssetHandler]'

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
])

export async function copyAssets(
  attachments: ReadonlyArray<AssetAttachment>,
  targetDir: string,
  importId: string
): Promise<AssetCopyResult> {
  const assetsDir = path.join(targetDir, 'assets', importId)
  await fs.promises.mkdir(assetsDir, { recursive: true })

  const pathMapping = new Map<string, string>()
  let copied = 0
  let failed = 0
  let renamed = 0
  const usedNames = new Set<string>()

  for (const attachment of attachments) {
    const ext = path.extname(attachment.fileName).toLowerCase()
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      logger.debug(`${LOG_PREFIX} Skipping unsupported image format`, {
        fileName: attachment.fileName,
      })
      continue
    }

    let targetName = attachment.fileName
    if (usedNames.has(targetName)) {
      const base = path.basename(targetName, ext)
      let seq = 1
      while (usedNames.has(`${base}_${seq}${ext}`)) {
        seq++
      }
      targetName = `${base}_${seq}${ext}`
      renamed++
    }
    usedNames.add(targetName)

    const targetPath = path.join(assetsDir, targetName)
    const relativePath = `assets/${importId}/${targetName}`

    try {
      if (attachment.buffer) {
        await fs.promises.writeFile(targetPath, attachment.buffer)
        pathMapping.set(attachment.fileName, relativePath)
        if (attachment.sourcePath) {
          pathMapping.set(attachment.sourcePath, relativePath)
        }
        copied++
      } else if (attachment.sourcePath) {
        await fs.promises.copyFile(attachment.sourcePath, targetPath)
        pathMapping.set(attachment.fileName, relativePath)
        pathMapping.set(attachment.sourcePath, relativePath)
        copied++
      } else {
        logger.warn(`${LOG_PREFIX} No buffer or sourcePath for asset`, {
          fileName: attachment.fileName,
        })
        failed++
      }
    } catch (error) {
      logger.warn(`${LOG_PREFIX} Failed to copy asset`, {
        fileName: attachment.fileName,
        error: error instanceof Error ? error.message : String(error),
      })
      failed++
    }
  }

  logger.info(`${LOG_PREFIX} Assets copied`, { copied, failed, renamed })
  return { copied, failed, renamed, pathMapping }
}

export function rewriteImagePaths(
  content: string,
  importId: string,
  pathMapping: Map<string, string>
): string {
  let result = content

  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (fullMatch: string, alt: string, imgPath: string) => {
      const mapped = resolveMapping(imgPath, pathMapping)
      if (mapped) {
        return `![${alt}](${mapped})`
      }
      return fullMatch
    }
  )

  result = result.replace(
    /!\[\[([^\]]+)\]\]/g,
    (_fullMatch: string, fileName: string) => {
      const mapped = pathMapping.get(fileName)
      if (mapped) {
        return `![](${mapped})`
      }
      return `![](assets/${importId}/${fileName})`
    }
  )

  return result
}

function resolveMapping(
  imgPath: string,
  pathMapping: Map<string, string>
): string | null {
  if (pathMapping.has(imgPath)) {
    return pathMapping.get(imgPath) ?? null
  }
  const baseName = path.basename(imgPath)
  if (pathMapping.has(baseName)) {
    return pathMapping.get(baseName) ?? null
  }
  return null
}
