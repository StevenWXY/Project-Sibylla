import React, { useState, useEffect, useCallback } from 'react'
import { UserPlus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useMembersStore, selectMembers, selectIsLoading } from '../../store/membersStore'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { InviteMemberDialog } from './InviteMemberDialog'
import { MemberRoleSelect } from './MemberRoleSelect'
import { RemoveMemberDialog } from './RemoveMemberDialog'
import type { WorkspaceMember } from '../../../shared/types'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  editor: '编辑者',
  viewer: '查看者',
}

const ROLE_BADGE_VARIANT: Record<string, 'primary' | 'info' | 'default'> = {
  admin: 'primary',
  editor: 'info',
  viewer: 'default',
}

function Avatar({ name, url, size = 'md' }: { name: string; url?: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizeClass} rounded-full object-cover`}
      />
    )
  }

  const initial = name.charAt(0).toUpperCase()
  return (
    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 font-medium`}>
      {initial}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANT[role] ?? 'default'} size="sm">
      {ROLE_LABELS[role] ?? role}
    </Badge>
  )
}

function MemberRow({
  member,
  isCurrentUser,
  isAdminUser,
  workspaceId,
  onRemove,
}: {
  member: WorkspaceMember
  isCurrentUser: boolean
  isAdminUser: boolean
  workspaceId: string
  onRemove: (member: WorkspaceMember) => void
}) {
  const [updatingRole, setUpdatingRole] = useState(false)
  const updateRole = useMembersStore((s) => s.updateRole)

  const handleRoleChange = useCallback(
    async (newRole: string) => {
      if (newRole === member.role) return
      setUpdatingRole(true)
      try {
        await updateRole(workspaceId, member.id, newRole as WorkspaceMember['role'])
      } catch {
        // Error is handled by caller context
      } finally {
        setUpdatingRole(false)
      }
    },
    [updateRole, workspaceId, member.id, member.role],
  )

  return (
    <li className="flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-white/5">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} url={member.avatarUrl} size="sm" />
        <div>
          <p className="text-sm font-medium text-white">
            {member.name}
            {isCurrentUser && (
              <span className="ml-2 text-xs text-sys-darkMuted">(你)</span>
            )}
          </p>
          <p className="text-xs text-sys-darkMuted">{member.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <RoleBadge role={member.role} />
        {isAdminUser && !isCurrentUser && (
          <MemberRoleSelect
            member={member}
            onRoleChange={handleRoleChange}
            onRemove={() => onRemove(member)}
            disabled={updatingRole}
          />
        )}
      </div>
    </li>
  )
}

export function MemberList() {
  const currentWorkspace = useAppStore((s) => s.currentWorkspace)
  const currentUser = useAppStore((s) => s.currentUser)
  const members = useMembersStore(selectMembers)
  const isLoading = useMembersStore(selectIsLoading)
  const loadMembers = useMembersStore((s) => s.loadMembers)
  const isAdmin = useMembersStore((s) => s.isAdmin)

  const [showInvite, setShowInvite] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)

  const workspaceId = currentWorkspace?.config.workspaceId ?? ''

  useEffect(() => {
    if (workspaceId) {
      loadMembers(workspaceId)
    }
  }, [workspaceId, loadMembers])

  const handleRemove = useCallback((member: WorkspaceMember) => {
    setRemoveTarget(member)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sys-darkMuted">
        加载中...
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      {isAdmin() && (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => setShowInvite(true)}
          >
            邀请成员
          </Button>
        </div>
      )}

      {members.length === 0 ? (
        <div className="py-8 text-center text-sys-darkMuted">
          暂无成员
        </div>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isCurrentUser={member.id === currentUser?.id}
              isAdminUser={isAdmin()}
              workspaceId={workspaceId}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}

      {showInvite && workspaceId && (
        <InviteMemberDialog
          workspaceId={workspaceId}
          onClose={() => setShowInvite(false)}
        />
      )}

      {removeTarget && workspaceId && (
        <RemoveMemberDialog
          member={removeTarget}
          workspaceId={workspaceId}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  )
}
