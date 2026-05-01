const PERSONAL_PREFIX = 'personal/'

function normalizePath(p: string): string {
  let normalized = p
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }
  return normalized
}

export function extractPersonalUser(filePath: string): string | null {
  const normalized = normalizePath(filePath)
  if (!normalized.startsWith(PERSONAL_PREFIX)) {
    return null
  }

  const remainder = normalized.slice(PERSONAL_PREFIX.length)
  if (!remainder) {
    return null
  }

  const slashIdx = remainder.indexOf('/')
  if (slashIdx === -1) {
    return remainder || null
  }

  return remainder.slice(0, slashIdx) || null
}

export function isPersonalPath(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  return normalized.startsWith(PERSONAL_PREFIX)
}

export function isOtherUsersPersonal(filePath: string, currentUserId: string): boolean {
  const targetUser = extractPersonalUser(filePath)
  if (targetUser === null) {
    return false
  }
  return targetUser !== currentUserId
}
