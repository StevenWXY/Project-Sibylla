import { promises as fs } from 'fs'
import * as path from 'path'
import type { SkillV2 } from '../../../shared/types'
import type { FileManager } from '../file-manager'
import { isPathInsideRoot } from '../../utils/path-boundary'
import { logger } from '../../utils/logger'

export const SKILL_TRASH_ROOT = '.trash/skills'
const TRASH_META_FILE = '.sibylla-trash.json'

export interface SkillTrashMeta {
  originalPath: string
  trashedAt: number
}

export function getSkillTrashPath(skillId: string): string {
  return `${SKILL_TRASH_ROOT}/${skillId}`
}

export function getTrashMetaPath(skillDir: string): string {
  return `${skillDir}/${TRASH_META_FILE}`
}

export async function readTrashMeta(skillDir: string, workspaceRoot: string): Promise<SkillTrashMeta | null> {
  const metaPath = path.join(workspaceRoot, getTrashMetaPath(skillDir))
  try {
    const raw = await fs.readFile(metaPath, 'utf-8')
    return JSON.parse(raw) as SkillTrashMeta
  } catch {
    return null
  }
}

export async function softDeleteSkill(
  workspaceRoot: string,
  fileManager: FileManager,
  skill: SkillV2,
): Promise<void> {
  if (skill.source === 'builtin') {
    throw new Error('Cannot delete builtin skills')
  }

  const absoluteSource = fileManager.resolvePath(skill.filePath)
  if (!isPathInsideRoot(workspaceRoot, absoluteSource)) {
    throw new Error('Skill path is outside workspace')
  }

  const trashRelative = getSkillTrashPath(skill.id)
  const absoluteTrash = path.join(workspaceRoot, trashRelative)

  if (absoluteSource === absoluteTrash || absoluteSource.startsWith(`${absoluteTrash}${path.sep}`)) {
    throw new Error('Skill is already in trash')
  }

  await fs.mkdir(path.dirname(absoluteTrash), { recursive: true })

  try {
    await fs.rename(absoluteSource, absoluteTrash)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as NodeJS.ErrnoException).code) : ''
    if (code === 'EXDEV') {
      await fs.cp(absoluteSource, absoluteTrash, { recursive: true })
      if (skill.formatVersion === 2) {
        await fileManager.deleteDirectory(skill.filePath, { recursive: true })
      } else {
        await fileManager.deleteFile(skill.filePath)
      }
    } else {
      throw err
    }
  }

  const meta: SkillTrashMeta = {
    originalPath: skill.filePath.replace(/\\/g, '/'),
    trashedAt: Date.now(),
  }
  await fs.writeFile(
    path.join(absoluteTrash, TRASH_META_FILE),
    JSON.stringify(meta, null, 2),
    'utf-8',
  )

  logger.info('[SkillTrash] Skill moved to trash', { skillId: skill.id, trashRelative })
}

export async function restoreSkillFromTrash(
  workspaceRoot: string,
  skillId: string,
): Promise<string> {
  const trashRelative = getSkillTrashPath(skillId)
  const absoluteTrash = path.join(workspaceRoot, trashRelative)

  const meta = await readTrashMeta(trashRelative, workspaceRoot)
  if (!meta) {
    throw new Error(`Trashed skill not found: ${skillId}`)
  }

  const originalRelative = meta.originalPath.replace(/\\/g, '/')
  const absoluteOriginal = path.join(workspaceRoot, originalRelative)

  if (!isPathInsideRoot(workspaceRoot, absoluteOriginal)) {
    throw new Error('Original skill path is outside workspace')
  }

  try {
    await fs.access(absoluteOriginal)
    throw new Error(`Cannot restore: path already exists (${originalRelative})`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Cannot restore')) {
      throw err
    }
  }

  await fs.mkdir(path.dirname(absoluteOriginal), { recursive: true })
  await fs.rename(absoluteTrash, absoluteOriginal)

  const metaPath = path.join(absoluteOriginal, TRASH_META_FILE)
  try {
    await fs.unlink(metaPath)
  } catch {
    // optional
  }

  logger.info('[SkillTrash] Skill restored', { skillId, originalRelative })
  return originalRelative
}

export async function listTrashedSkillDirs(
  workspaceRoot: string,
): Promise<Array<{ dirPath: string; meta: SkillTrashMeta }>> {
  const trashRoot = path.join(workspaceRoot, SKILL_TRASH_ROOT)
  let entries: string[] = []
  try {
    entries = await fs.readdir(trashRoot)
  } catch {
    return []
  }

  const results: Array<{ dirPath: string; meta: SkillTrashMeta }> = []
  for (const entry of entries) {
    const relativeDir = `${SKILL_TRASH_ROOT}/${entry}`
    const meta = await readTrashMeta(relativeDir, workspaceRoot)
    if (meta) {
      results.push({ dirPath: relativeDir, meta })
    }
  }
  return results
}
