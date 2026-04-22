import React, { useEffect } from 'react'
import { usePlanStore } from '../../store/planStore'
import { formatRelativeTime } from '../../utils/formatRelativeTime'

interface PlanListProps {
  onSelect?: (planId: string) => void
}

const STATUS_PILLS: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: '#EFF6FF', color: '#2563EB', label: '草稿' },
  'draft-unparsed': { bg: '#FEF9C3', color: '#CA8A04', label: '解析失败' },
  in_progress: { bg: '#ECFDF5', color: '#059669', label: '执行中' },
}

export const PlanList: React.FC<PlanListProps> = ({ onSelect }) => {
  const { activePlans, loading, fetchActivePlans } = usePlanStore()

  useEffect(() => {
    void fetchActivePlans()
  }, [fetchActivePlans])

  if (loading && activePlans.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
        加载中...
      </div>
    )
  }

  if (activePlans.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
        暂无活动计划。在 Plan 模式下让 AI 生成计划。
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', padding: '0 4px' }}>
        <span style={{ fontSize: '14px' }}>🗺️</span>
        <span style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>活动计划</span>
        <span
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '10px',
            background: '#EFF6FF',
            color: '#3B82F6',
            fontWeight: 500,
          }}
        >
          {activePlans.length}
        </span>
      </div>

      {activePlans.map((plan) => {
        const pill = STATUS_PILLS[plan.status] ?? STATUS_PILLS.draft!
        return (
          <div
            key={plan.id}
            onClick={() => onSelect?.(plan.id)}
            style={{
              padding: '10px 12px',
              marginBottom: '4px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              background: '#fff',
              cursor: onSelect ? 'pointer' : 'default',
              transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
              e.currentTarget.style.borderColor = '#C7D2FE'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.borderColor = '#E5E7EB'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '12px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {plan.title}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: pill!.bg,
                  color: pill!.color,
                  fontWeight: 500,
                  flexShrink: 0,
                  marginLeft: '8px',
                }}
              >
                {pill!.label}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '3px' }}>
              {formatRelativeTime(plan.createdAt)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
