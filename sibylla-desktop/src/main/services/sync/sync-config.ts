/**
 * Sync Configuration — sync layering rules and .gitignore management
 *
 * Defines three sync tiers:
 *   1. Core data (always synced): .sibylla/plans/, .sibylla/agents/
 *   2. Personal preferences (opt-in synced): .sibylla/memory/MEMORY.encrypted
 *   3. Local cache (never synced): trace/, events/, index/, mcp/, snapshots/, handbook-local/
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase A
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import type { GitAbstraction } from '../git-abstraction'

const LOG_PREFIX = '[SyncConfig]'

export const SYNC_ALWAYS_EXCLUDE = [
  '.sibylla/trace/',
  '.sibylla/events/',
  '.sibylla/index/',
  '.sibylla/mcp/',
  '.sibylla/snapshots/',
  '.sibylla/handbook-local/',
] as const

export const SYNC_ALWAYS_INCLUDE = [
  '.sibylla/plans/',
  '.sibylla/agents/',
] as const

export const SYNC_OPTIONAL = [
  '.sibylla/memory/MEMORY.encrypted',
] as const

export const GITIGNORE_MARKER_START = '# >>> Sibylla sync rules >>>'
export const GITIGNORE_MARKER_END = '# <<< Sibylla sync rules <<<'

export type SyncExcludeEntry = (typeof SYNC_ALWAYS_EXCLUDE)[number]
export type SyncIncludeEntry = (typeof SYNC_ALWAYS_INCLUDE)[number]

function stripTrailingSlash(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p
}

export async function ensureGitignoreRules(workspaceRoot: string): Promise<void> {
  const gitignorePath = path.join(workspaceRoot, '.gitignore')

  let content = ''
  try {
    content = await fs.readFile(gitignorePath, 'utf-8')
  } catch {
    content = ''
  }

  const lines = content.split('\n')
  const existingSet = new Set(lines.map((l) => l.trim()).filter(Boolean))

  const missing: string[] = []
  for (const rule of SYNC_ALWAYS_EXCLUDE) {
    if (!existingSet.has(rule) && !existingSet.has(stripTrailingSlash(rule))) {
      missing.push(rule)
    }
  }

  for (const dir of SYNC_ALWAYS_INCLUDE) {
    const bare = stripTrailingSlash(dir)
    if (existingSet.has(dir) || existingSet.has(bare)) {
      const idx = lines.findIndex(
        (l) => l.trim() === dir || l.trim() === bare,
      )
      if (idx !== -1) {
        lines.splice(idx, 1)
      }
    }
  }

  if (missing.length === 0 && !existingSet.has(GITIGNORE_MARKER_START)) {
    if (!content.endsWith('\n') && content.length > 0) {
      content += '\n'
    }
  }

  if (missing.length > 0) {
    let block = ''
    if (!existingSet.has(GITIGNORE_MARKER_START)) {
      if (content.length > 0 && !content.endsWith('\n')) {
        block += '\n'
      }
      block += `${GITIGNORE_MARKER_START}\n`
    }

    for (const rule of missing) {
      block += `${rule}\n`
      logger.info(`${LOG_PREFIX} Added .gitignore rule: ${rule}`)
    }

    if (!existingSet.has(GITIGNORE_MARKER_END)) {
      block += `${GITIGNORE_MARKER_END}\n`
    }

    const newContent =
      existingSet.has(GITIGNORE_MARKER_START)
        ? injectBeforeMarker(content, GITIGNORE_MARKER_END, missing)
        : content + block

    await atomicWriteFile(gitignorePath, newContent)
    logger.info(`${LOG_PREFIX} .gitignore updated`, { addedRules: missing })
  } else {
    logger.debug(`${LOG_PREFIX} .gitignore rules already up to date`)
  }
}

function injectBeforeMarker(
  content: string,
  marker: string,
  rules: readonly string[],
): string {
  const markerIdx = content.indexOf(marker)
  if (markerIdx === -1) {
    return content + rules.map((r) => `${r}\n`).join('')
  }

  const before = content.slice(0, markerIdx)
  const after = content.slice(markerIdx)
  const injection = rules.map((r) => `${r}\n`).join('')
  return before + injection + after
}

export async function detectStaleSyncedPaths(
  _workspaceRoot: string,
  gitAbstraction: GitAbstraction,
): Promise<readonly string[]> {
  const stalePaths: string[] = []

  try {
    const trackedFiles = await gitAbstraction.listFiles()

    for (const excludePath of SYNC_ALWAYS_EXCLUDE) {
      const prefix = stripTrailingSlash(excludePath)
      const found = trackedFiles.some((f) => f === prefix || f.startsWith(prefix + '/'))
      if (found) {
        stalePaths.push(excludePath)
        logger.warn(`${LOG_PREFIX} Stale synced path detected in remote: ${excludePath}`)
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`${LOG_PREFIX} Failed to detect stale synced paths`, { error: msg })
  }

  return stalePaths
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
  await fs.writeFile(tempPath, content, 'utf-8')
  await fs.rename(tempPath, filePath)
}
