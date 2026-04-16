import React, { useState, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { useMembersStore } from '../../store/membersStore'
import type { MemberRole } from '../../../shared/types'

interface InviteMemberDialogProps {
  workspaceId: string
  onClose: () => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLE_OPTIONS = [
  { value: 'editor', label: '编辑者 — 可编辑、创建、删除文件' },
  { value: 'viewer', label: '查看者 — 仅可查看和评论' },
]

export function InviteMemberDialog({ workspaceId, onClose }: InviteMemberDialogProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('editor')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const inviteMember = useMembersStore((s) => s.inviteMember)

  const handleSubmit = useCallback(async () => {
    if (!email.trim()) {
      setError('请输入邮箱地址')
      return
    }

    if (!EMAIL_REGEX.test(email)) {
      setError('请输入有效的邮箱地址')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const result = await inviteMember(workspaceId, email, role)

    setIsSubmitting(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(onClose, 1500)
    } else {
      setError(result.error ?? '邀请失败，请重试')
    }
  }, [email, role, inviteMember, workspaceId, onClose])

  return (
    <Modal isOpen onClose={onClose} title="邀请成员" size="md">
      <div className="space-y-4">
        <Input
          label="邮箱地址"
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          error={error ?? undefined}
        />

        <Select
          label="角色"
          value={role}
          onChange={(v) => setRole(v as MemberRole)}
          options={ROLE_OPTIONS}
        />

        {success && (
          <p className="text-sm text-emerald-400">邀请已发送！</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || success}
          >
            {isSubmitting ? '发送中...' : '发送邀请'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
