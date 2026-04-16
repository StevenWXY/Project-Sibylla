/**
 * usePermission — React hook for workspace permission checks
 *
 * Returns the current user's PermissionCheck derived from
 * their role in the current workspace. Components use this
 * to conditionally render edit/manage buttons.
 *
 * Usage:
 *   const perm = usePermission()
 *   perm.canEdit   // true for admin/editor
 *   perm.canManageMembers  // true for admin only
 */

import { useMembersStore } from '../store/membersStore'
import type { PermissionCheck } from '../../shared/types'

export function usePermission(): PermissionCheck {
  const getPermissions = useMembersStore((s) => s.getPermissions)
  return getPermissions()
}
