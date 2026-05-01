import React, { useEffect, useMemo, useCallback } from 'react'
import { useProductivityStore } from '../../store/productivityStore'
import type { AnalysisPeriod, DimensionScore } from '../../../../main/services/productivity/types'

const DIMENSION_LABELS: Record<string, string> = {
  taskCompletion: '任务完成率',
  docContribution: '文档贡献度',
  collabResponsiveness: '协作响应速度',
  knowledgeContribution: '知识贡献度',
}

const DIMENSION_COLORS: Record<string, string> = {
  taskCompletion: '#6366F1',
  docContribution: '#8B5CF6',
  collabResponsiveness: '#EC4899',
  knowledgeContribution: '#F59E0B',
}

const PERIOD_OPTIONS: { value: AnalysisPeriod; label: string }[] = [
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季度' },
]

export const ProductivityPanel: React.FC = () => {
  const report = useProductivityStore((s) => s.report)
  const isLoading = useProductivityStore((s) => s.isLoading)
  const period = useProductivityStore((s) => s.period)
  const selectedMemberId = useProductivityStore((s) => s.selectedMemberId)
  const error = useProductivityStore((s) => s.error)
  const analyze = useProductivityStore((s) => s.analyze)
  const setPeriod = useProductivityStore((s) => s.setPeriod)

  useEffect(() => {
    analyze(period, selectedMemberId ?? undefined)
  }, [period, selectedMemberId, analyze])

  const radarChart = useMemo(() => {
    if (!report) return null

    const dims = Object.entries(report.dimensions) as Array<[string, DimensionScore]>
    const validDims = dims.filter(([, d]) => !d.isNA)
    if (validDims.length === 0) return null

    const cx = 100
    const cy = 100
    const r = 70

    const axes = validDims.map(([key, dim], i) => {
      const angle = (Math.PI * 2 * i) / validDims.length - Math.PI / 2
      const value = dim.normalized
      return {
        key,
        angle,
        labelX: cx + Math.cos(angle) * (r + 20),
        labelY: cy + Math.sin(angle) * (r + 20),
        pointX: cx + Math.cos(angle) * r * value,
        pointY: cy + Math.sin(angle) * r * value,
        axisX: cx + Math.cos(angle) * r,
        axisY: cy + Math.sin(angle) * r,
      }
    })

    const polygonPoints = axes.map((a) => `${a.pointX},${a.pointY}`).join(' ')

    return (
      <svg width="200" height="200" viewBox="0 0 200 200">
        {axes.map((axis) => (
          <line
            key={axis.key}
            x1={cx}
            y1={cy}
            x2={axis.axisX}
            y2={axis.axisY}
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}
        <polygon
          points={polygonPoints}
          fill="rgba(99,102,241,0.15)"
          stroke="#6366F1"
          strokeWidth={2}
        />
        {axes.map((axis) => (
          <React.Fragment key={axis.key}>
            <circle cx={axis.pointX} cy={axis.pointY} r={3} fill={DIMENSION_COLORS[axis.key] ?? '#6366F1'} />
            <text
              x={axis.labelX}
              y={axis.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 9, fill: '#6B7280' }}
            >
              {DIMENSION_LABELS[axis.key] ?? axis.key}
            </text>
          </React.Fragment>
        ))}
      </svg>
    )
  }, [report])

  const dimensionCards = useMemo(() => {
    if (!report) return null
    const dims = Object.entries(report.dimensions) as Array<[string, DimensionScore]>

    return dims.map(([key, dim]) => (
      <div key={key} style={styles.dimensionCard}>
        <div style={styles.dimensionHeader}>
          <span style={styles.dimensionLabel}>{dim.label}</span>
          {dim.isNA && <span style={styles.naBadge}>N/A</span>}
        </div>
        {!dim.isNA && (
          <>
            <div style={styles.scoreRow}>
              <span style={{ ...styles.scoreValue, color: DIMENSION_COLORS[key] ?? '#6366F1' }}>
                {(dim.normalized * 100).toFixed(0)}%
              </span>
              <span style={styles.rawScore}>
                原始分: {dim.raw.toFixed(2)}
              </span>
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${dim.normalized * 100}%`,
                  background: DIMENSION_COLORS[key] ?? '#6366F1',
                }}
              />
            </div>
            {dim.details && (
              <span style={styles.dimensionDetails}>{dim.details}</span>
            )}
          </>
        )}
      </div>
    ))
  }, [report])

  const handlePeriodChange = useCallback(
    (newPeriod: AnalysisPeriod) => {
      setPeriod(newPeriod)
    },
    [setPeriod],
  )

  return (
    <div style={styles.container}>
      {report?.insufficientNotice && (
        <div style={styles.warningBanner}>
          ⚠️ {report.insufficientNotice}
        </div>
      )}

      {report?.adminView && (
        <div style={styles.adminBanner}>
          管理员视图
        </div>
      )}

      <div style={styles.periodSelector}>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            style={{
              ...styles.periodButton,
              background: period === opt.value ? '#6366F1' : '#F3F4F6',
              color: period === opt.value ? '#fff' : '#6B7280',
            }}
            onClick={() => handlePeriodChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span>分析中...</span>
        </div>
      )}

      {error && (
        <div style={styles.errorState}>
          <p style={{ color: '#DC2626' }}>{error}</p>
        </div>
      )}

      {report && !isLoading && (
        <>
          <div style={styles.overallSection}>
            <div style={styles.overallLabel}>综合分</div>
            <div style={styles.overallScore}>{(report.overall * 100).toFixed(0)}</div>
            <div style={styles.overallUnit}>/ 100</div>
          </div>

          <div style={styles.radarSection}>{radarChart}</div>

          <div style={styles.dimensionsGrid}>{dimensionCards}</div>
        </>
      )}

      {!report && !isLoading && !error && (
        <div style={styles.emptyState}>
          <p style={{ color: '#9CA3AF' }}>选择时间段开始分析工作产出</p>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    height: '100%',
    overflowY: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  warningBanner: {
    padding: '10px 14px',
    background: '#FEF3C7',
    color: '#92400E',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 12,
    border: '1px solid #FDE68A',
  },
  adminBanner: {
    padding: '6px 12px',
    background: '#EEF2FF',
    color: '#6366F1',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  periodSelector: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    background: '#F3F4F6',
    borderRadius: 6,
    padding: 3,
  },
  periodButton: {
    flex: 1,
    padding: '6px 12px',
    border: 'none',
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: 32,
    gap: 12,
    color: '#6B7280',
    fontSize: 13,
  },
  spinner: {
    width: 24,
    height: 24,
    border: '3px solid #E5E7EB',
    borderTopColor: '#6366F1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorState: {
    padding: 24,
    textAlign: 'center' as const,
  },
  overallSection: {
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  overallLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  overallScore: {
    fontSize: 36,
    fontWeight: 700,
    color: '#6366F1',
    lineHeight: 1,
    display: 'inline',
  },
  overallUnit: {
    fontSize: 14,
    color: '#9CA3AF',
    display: 'inline',
    marginLeft: 4,
  },
  radarSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dimensionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  dimensionCard: {
    padding: 12,
    background: '#F9FAFB',
    borderRadius: 8,
    border: '1px solid #E5E7EB',
  },
  dimensionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dimensionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  naBadge: {
    padding: '2px 6px',
    background: '#F3F4F6',
    color: '#9CA3AF',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 700,
  },
  rawScore: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  progressBar: {
    height: 4,
    background: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  dimensionDetails: {
    fontSize: 11,
    color: '#6B7280',
  },
  emptyState: {
    padding: 48,
    textAlign: 'center' as const,
  },
}
