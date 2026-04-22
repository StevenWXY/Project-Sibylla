import React, { useEffect, useState } from 'react'
import type { PlanStepShared } from '../../../shared/types'
import { usePlanStore } from '../../store/planStore'

interface PlanEditorProps {
  planId: string
}

export const PlanEditor: React.FC<PlanEditorProps> = ({ planId }) => {
  const { currentPlan, fetchPlan, abandon, loading, error, clearError } = usePlanStore()
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    void fetchPlan(planId)
  }, [planId, fetchPlan])

  if (!currentPlan) {
    if (loading) {
      return <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF' }}>加载中...</div>
    }
    return <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF' }}>计划不存在</div>
  }

  const { metadata, goal, steps, risks, successCriteria } = currentPlan
  const completedCount = steps.filter(s => s.done).length
  const totalCount = steps.length

  const groupedSteps = new Map<string, PlanStepShared[]>()
  const defaultSteps: PlanStepShared[] = []
  for (const step of steps) {
    const key = step.sectionTitle ?? '__default__'
    if (key === '__default__') {
      defaultSteps.push(step)
    } else {
      const existing = groupedSteps.get(key) ?? []
      existing.push(step)
      groupedSteps.set(key, existing)
    }
  }

  const handleToggleStep = async (stepText: string, currentDone: boolean) => {
    const raw = currentPlan.rawMarkdown
    const targetCheckbox = currentDone ? '- [ ]' : '- [x]'
    const escapedText = stepText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`- \\[([ xX])\\] ${escapedText}`)
    const updated = raw.replace(regex, `${targetCheckbox} ${stepText}`)
    if (updated !== raw) {
      await window.electronAPI.file.write(metadata.filePath, updated)
    }
  }

  const handleOpenExternal = () => {
    void window.electronAPI.file.read(metadata.filePath)
  }

  const handleAbandon = async () => {
    if (!confirmAbandon) {
      setConfirmAbandon(true)
      return
    }
    setActionLoading('abandon')
    try {
      await abandon(planId)
    } finally {
      setActionLoading(null)
      setConfirmAbandon(false)
    }
  }

  const renderStep = (step: PlanStepShared, idx: number) => (
    <div
      key={idx}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '4px 0',
        fontSize: '13px',
        color: step.done ? '#9CA3AF' : '#111827',
        textDecoration: step.done ? 'line-through' : 'none',
      }}
    >
      <input
        type="checkbox"
        checked={step.done}
        onChange={() => void handleToggleStep(step.text, step.done)}
        style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#3B82F6' }}
      />
      <span style={{ flex: 1 }}>{step.text}</span>
      {step.estimatedMinutes != null && (
        <span style={{ fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
          {step.estimatedMinutes >= 60 ? `${Math.round(step.estimatedMinutes / 60)}h` : `${step.estimatedMinutes}m`}
        </span>
      )}
    </div>
  )

  return (
    <div style={{ padding: '16px', maxWidth: '640px' }}>
      {error && (
        <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px', padding: '6px 8px', background: '#FEF2F2', borderRadius: '6px' }}>
          {error}
          <button onClick={clearError} style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '11px' }}>关闭</button>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>{metadata.title}</h2>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '11px', color: '#9CA3AF' }}>
          <span>{metadata.status}</span>
          <span>·</span>
          <span>创建: {new Date(metadata.createdAt).toLocaleDateString()}</span>
          <span>·</span>
          <span>{completedCount}/{totalCount} 步骤完成</span>
        </div>
        {metadata.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            {metadata.tags.map((tag, i) => (
              <span key={i} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: '#E5E7EB', color: '#6B7280' }}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      {goal && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>目标</h3>
          <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.5 }}>{goal}</div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>步骤</h3>
        <div style={{ width: '100%', height: '4px', background: '#E5E7EB', borderRadius: '2px', marginBottom: '10px' }}>
          <div
            style={{
              width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
              height: '100%',
              background: '#3B82F6',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        {defaultSteps.map((step, idx) => renderStep(step, idx))}
        {Array.from(groupedSteps.entries()).map(([sectionTitle, sectionSteps]) => (
          <div key={sectionTitle}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginTop: '12px', marginBottom: '4px' }}>{sectionTitle}</div>
            {sectionSteps.map((step, idx) => renderStep(step, idx))}
          </div>
        ))}
      </div>

      {risks && risks.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>风险与备案</h3>
          {risks.map((risk, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#92400E', padding: '2px 0' }}>{risk}</div>
          ))}
        </div>
      )}

      {successCriteria && successCriteria.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>成功标准</h3>
          {successCriteria.map((c, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#6B7280', padding: '2px 0' }}>{c}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #E5E7EB', paddingTop: '12px', marginTop: '16px' }}>
        <button
          onClick={handleOpenExternal}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}
        >
          在编辑器中打开
        </button>
        {metadata.status === 'in_progress' && (
          <button
            onClick={handleAbandon}
            disabled={actionLoading === 'abandon'}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: confirmAbandon ? '#DC2626' : '#F3F4F6',
              color: confirmAbandon ? '#fff' : '#9CA3AF',
              fontSize: '12px',
              cursor: 'pointer',
              opacity: actionLoading === 'abandon' ? 0.6 : 1,
            }}
          >
            {actionLoading === 'abandon' ? '...' : confirmAbandon ? '确认放弃？' : '放弃'}
          </button>
        )}
      </div>
    </div>
  )
}
