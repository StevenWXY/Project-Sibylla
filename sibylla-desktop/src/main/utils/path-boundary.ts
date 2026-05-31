import * as path from 'path'

/**
 * Returns true when `targetPath` resolves to the workspace root or a path inside it.
 * Uses path.relative to avoid prefix tricks (e.g. /tmp/ws vs /tmp/ws-evil).
 */
export function isPathInsideRoot(root: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(targetPath)
  const relative = path.relative(resolvedRoot, resolvedTarget)

  if (relative === '') {
    return true
  }

  return !relative.startsWith('..') && !path.isAbsolute(relative)
}
