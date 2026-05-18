import AdmZip from 'adm-zip'
import { promises as fs } from 'fs'
import path from 'path'
import { isPathInsideRoot } from '../../utils/path-boundary'

const INDEX_FILE = '_index.md'
const ID_PATTERN = /^id:\s*(.+)$/m

export async function exportSkillDirToBundle(
  absoluteSkillDir: string,
  outputAbsolutePath: string,
): Promise<void> {
  const zip = new AdmZip()
  zip.addLocalFolder(absoluteSkillDir)
  await fs.mkdir(path.dirname(outputAbsolutePath), { recursive: true })
  zip.writeZip(outputAbsolutePath)
}

export async function importSkillBundleFile(
  bundleAbsolutePath: string,
  workspaceRoot: string,
): Promise<{ skillId: string; relativeDir: string }> {
  if (!bundleAbsolutePath.endsWith('.sibylla-skill')) {
    throw new Error('Invalid bundle file: must be a .sibylla-skill file')
  }

  const stat = await fs.stat(bundleAbsolutePath)
  if (!stat.isFile()) {
    throw new Error('Bundle path is not a file')
  }

  const zip = new AdmZip(bundleAbsolutePath)
  const entries = zip.getEntries().filter((e) => !e.isDirectory)

  for (const entry of entries) {
    const normalized = path.normalize(entry.entryName)
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('Invalid bundle: path traversal detected')
    }
  }

  const importRoot = path.join(workspaceRoot, '.sibylla', 'tmp', `skill-import-${Date.now()}`)
  await fs.mkdir(importRoot, { recursive: true })

  try {
    zip.extractAllTo(importRoot, true)

    const indexPath = await findIndexFile(importRoot)
    if (!indexPath) {
      throw new Error('Invalid bundle: missing _index.md')
    }

    const indexContent = await fs.readFile(indexPath, 'utf-8')
    const idMatch = ID_PATTERN.exec(indexContent)
    const skillId = idMatch?.[1]?.trim()
    if (!skillId) {
      throw new Error('Invalid bundle: _index.md missing id field')
    }

    const targetRelative = path.join('.sibylla', 'skills', skillId)
    const targetAbsolute = path.join(workspaceRoot, targetRelative)

    if (!isPathInsideRoot(workspaceRoot, targetAbsolute)) {
      throw new Error('Invalid skill id in bundle')
    }

    await fs.rm(targetAbsolute, { recursive: true, force: true })
    await fs.rename(importRoot, targetAbsolute)

    return { skillId, relativeDir: targetRelative.replace(/\\/g, '/') }
  } catch (error) {
    await fs.rm(importRoot, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function findIndexFile(dir: string): Promise<string | null> {
  const direct = path.join(dir, INDEX_FILE)
  try {
    await fs.access(direct)
    return direct
  } catch {
    // search one level deep (zip root folder wrapper)
  }

  const children = await fs.readdir(dir, { withFileTypes: true })
  for (const child of children) {
    if (!child.isDirectory()) continue
    const nested = path.join(dir, child.name, INDEX_FILE)
    try {
      await fs.access(nested)
      return nested
    } catch {
      continue
    }
  }
  return null
}
