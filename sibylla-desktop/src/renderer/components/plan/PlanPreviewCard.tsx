import React, { useState } from 'react'
import type { PlanMetadataShared, PlanFollowUpResultShared } from '../../../shared/types'
import { usePlanStore } from '../../store/planStore'

interface PlanPreviewCardProps {
  planMetadata: PlanMetadataShared
  conversationId: string
}

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
  draft: { bg: '#EFF6FF', border: '#BFDBFE', color: '#2563EB', label: '草稿' },
  'draft-unparsed': { bg: '#FEF9C3', border: '#FDE68A', color: '#CA8A04', label: '解析失败' },
  in_progress: { bg: '#ECFDF5', border: '#A7F3D0', color: '#059669', label: '执行中' },
  completed: { bg: '#F3F4F6', border: '#D1D5DB', color: '#6B7280', label: '已完成' },
  archived: { bg: '#F3F4F6', border: '#D1D5DB', color: '#9CA3AF', label: '已归档' },
  abandoned: { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', label: '已放弃' },
}

const buttonBase: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: 'opacity 0.15s ease',
}

export const PlanPreviewCard: React.FC<PlanPreviewCardProps> = ({ planMetadata }) => {
  const [followUpResult, setFollowUpResult] = useState<PlanFollowUpResultShared | null>(null)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const { startExecution, abandon, followUp, error, clearError } = usePlanStore()

  const statusStyle = STATUS_STYLES[planMetadata.status] ?? STATUS_STYLES.draft!

  const handleStartExecution = async () => {
    setLoading('execution')
    clearError()
    try {
      await startExecution(planMetadata.id)
    } finally {
      setLoading(null)
    }
  }

  const handleFollowUp = async () => {
    setLoading('followup')
    try {
      const result = await followUp(planMetadata.id)
      setFollowUpResult(result)
      setShowFollowUp(true)
    } catch {
      // error handled in store
    } finally {
      setLoading(null)
    }
  }

  const handleAbandon = async () => {
    if (!confirmAbandon) {
      setConfirmAbandon(true)
      return
    }
    setLoading('abandon')
    try {
      await abandon(planMetadata.id)
    } finally {
      setLoading(null)
      setConfirmAbandon(false)
    }
  }

  const handleOpenFile = () => {
    void window.electronAPI.file.read(planMetadata.filePath)
  }

  return (
    <div
      style={{
        border: `1px solid ${statusStyle!.border}`,
        borderRadius: '8px',
        padding: '12px',
        background: statusStyle!.bg,
        marginTop: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>🗺️</span>
          <span style={{ fontWeight: 600, color: '#111827', fontSize: '13px' }}>{planMetadata.title}</span>
        </div>
        <span
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: statusStyle!.color,
            color: '#fff',
            fontWeight: 500,
          }}
        >
          {statusStyle!.label}
        </span>
      </div>

      {planMetadata.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {planMetadata.tags.map((tag, i) => (
            <span
              key={i}
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#E5E7EB',
                color: '#6B7280',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '6px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {(planMetadata.status === 'draft' || planMetadata.status === 'draft-unparsed') && (
          <>
            {planMetadata.status === 'draft' && (
              <button
                onClick={handleStartExecution}
                disabled={loading === 'execution'}
                style={{
                  ...buttonBase,
                  background: '#059669',
                  color: '#fff',
                  opacity: loading === 'execution' ? 0.6 : 1,
                }}
              >
                {loading === 'execution' ? '...' : '开始执行'}
              </button>
            )}
            {planMetadata.status === 'draft-unparsed' && (
              <span style={{ fontSize: '11px', color: '#CA8A04', lineHeight: '24px' }}>
                ⚠️ 计划格式解析失败，请手动编辑
              </span>
            )}
            <button
              onClick={handleOpenFile}
              style={{ ...buttonBase, background: '#F3F4F6', color: '#374151' }}
            >
              打开文件
            </button>
          </>
        )}

        {planMetadata.status === 'in_progress' && (
          <>
            <button
              onClick={handleFollowUp}
              disabled={loading === 'followup'}
              style={{
                ...buttonBase,
                background: '#3B82F6',
                color: '#fff',
                opacity: loading === 'followup' ? 0.6 : 1,
              }}
            >
              {loading === 'followup' ? '...' : '跟进进度'}
            </button>
            <button
              onClick={handleOpenFile}
              style={{ ...buttonBase, background: '#F3F4F6', color: '#374151' }}
            >
              打开文件
            </button>
            <button
              onClick={handleAbandon}
              disabled={loading === 'abandon'}
              style={{
                ...buttonBase,
                background: confirmAbandon ? '#DC2626' : '#F3F4F6',
                color: confirmAbandon ? '#fff' : '#9CA3AF',
                opacity: loading === 'abandon' ? 0.6 : 1,
              }}
            >
              {loading === 'abandon' ? '...' : confirmAbandon ? '确认放弃？' : '放弃'}
            </button>
          </>
        )}
      </div>

      {showFollowUp && followUpResult && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            borderRadius: '6px',
            background: '#fff',
            border: '1px solid #E5E7EB',
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            进度: {Math.round(followUpResult.progress * 100)}% ({followUpResult.completedSteps}/{followUpResult.totalSteps} 步骤完成)
          </div>
          <div style={{ width: '100%', height: '4px', background: '#E5E7EB', borderRadius: '2px', marginBottom: '6px' }}>
            <div
              style={{
                width: `${followUpResult.progress * 100}%`,
                height: '100%',
                background: '#3B82F6',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          {followUpResult.notes.map((note, i) => (
            <div key={i} style={{ color: '#6B7280' }}>{note}</div>
          ))}
        </div>
      )}
    </div>
  )
}
