import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { MemberList } from './MemberList'

type SettingsTab = 'members' | 'general'

interface WorkspaceSettingsProps {
  onClose: () => void
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-white text-white'
          : 'border-transparent text-sys-darkMuted hover:text-white'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function WorkspaceSettings({ onClose }: WorkspaceSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('members')

  return (
    <Modal isOpen onClose={onClose} title="工作区设置" size="lg">
      <div className="-mx-6 -mb-6">
        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')}>
            成员管理
          </TabButton>
          <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')}>
            基本信息
          </TabButton>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {activeTab === 'members' && <MemberList />}
          {activeTab === 'general' && (
            <div className="flex items-center justify-center py-12 text-sm text-sys-darkMuted">
              基本信息设置（即将推出）
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
