import React, { useState, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useMembersStore } from '../../store/membersStore'
import type { WorkspaceMember } from '../../../shared/types'

interface RemoveMemberDialogProps {
  member: WorkspaceMember
  workspaceId: string
  onClose: () => void
}

export function RemoveMemberDialog({ member, workspaceId, onClose }: RemoveMemberDialogProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const removeMember = useMembersStore((s) => s.removeMember)

  const handleConfirm = useCallback(async () => {
    setIsRemoving(true)
    setError(null)

    try {
      await removeMember(workspaceId, member.id)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '移除成员失败')
      setIsRemoving(false)
    }
  }, [removeMember, workspaceId, member.id, onClose])

  return (
    <Modal isOpen onClose={onClose} title="移除成员" size="sm">
      <div className="space-y-4">
        <div className="text-sm text-sys-darkMuted">
          <p>
            确定要将 <span className="font-medium text-white">{member.name}</span>{' '}
            ({member.email}) 移除出此工作区吗？
          </p>
          <p className="mt-2">移除后该成员将无法访问此工作区。</p>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            disabled={isRemoving}
          >
            {isRemoving ? '移除中...' : '确认移除'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
