import React, { useEffect, useMemo, useCallback } from 'react'
import { useReportStore } from '../../store/reportStore'

interface ReportViewerProps {
  filePath?: string
}

const DIMENSION_COLORS: Record<string, string> = {
  taskCompletion: '#6366F1',
  docContribution: '#8B5CF6',
  collabResponsiveness: '#EC4899',
  knowledgeContribution: '#F59E0B',
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ filePath }) => {
  const reports = useReportStore((s) => s.reports)
  const currentReport = useReportStore((s) => s.currentReport)
  const isGenerating = useReportStore((s) => s.isGenerating)
  const generateError = useReportStore((s) => s.generateError)
  const fetchReportList = useReportStore((s) => s.fetchReportList)
  const getReport = useReportStore((s) => s.getReport)
  const generateReport = useReportStore((s) => s.generateReport)

  useEffect(() => {
    fetchReportList()
  }, [fetchReportList])

  useEffect(() => {
    if (filePath) {
      getReport(filePath)
    }
  }, [filePath, getReport])

  const taskChart = useMemo(() => {
    if (!currentReport) return null
    const taskMatch = currentReport.match(/任务进展[\s\S]*?(?=##|$)/)
    if (!taskMatch) return null

    const completed = (taskMatch[0].match(/✅/g) || []).length
    const inProgress = (taskMatch[0].match(/🔄/g) || []).length
    const newTasks = (taskMatch[0].match(/🆕/g) || []).length

    if (completed === 0 && inProgress === 0 && newTasks === 0) return null

    const maxVal = Math.max(completed, inProgress, newTasks, 1)

    return (
      <div style={{ padding: '12px 0' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
          任务完成柱状图
        </h4>
        <svg width="200" height="100" viewBox="0 0 200 100">
          {[
            { label: '已完成', value: completed, color: '#10B981' },
            { label: '进行中', value: inProgress, color: '#F59E0B' },
            { label: '新增', value: newTasks, color: '#6366F1' },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              <rect
                x={30 + i * 60}
                y={80 - (item.value / maxVal) * 60}
                width={40}
                height={(item.value / maxVal) * 60}
                fill={item.color}
                rx={4}
              />
              <text
                x={50 + i * 60}
                y={95}
                textAnchor="middle"
                style={{ fontSize: 10, fill: '#6B7280' }}
              >
                {item.label}
              </text>
              <text
                x={50 + i * 60}
                y={75 - (item.value / maxVal) * 60}
                textAnchor="middle"
                style={{ fontSize: 11, fontWeight: 600, fill: item.color }}
              >
                {item.value}
              </text>
            </React.Fragment>
          ))}
        </svg>
      </div>
    )
  }, [currentReport])

  const commitChart = useMemo(() => {
    if (!currentReport) return null
    const commitMatch = currentReport.match(/提交记录[\s\S]*?(?=##|$)/)
    if (!commitMatch) return null

    const commitLines = commitMatch[0].split('\n').filter((l) => l.trim().startsWith('-'))
    const dailyCounts = [commitLines.length]
    const labels = ['今日']

    if (dailyCounts[0] === 0) return null

    const maxVal = Math.max(...dailyCounts, 1)

    return (
      <div style={{ padding: '12px 0' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
          提交活跃度
        </h4>
        <svg width="200" height="80" viewBox="0 0 200 80">
          <polyline
            fill="none"
            stroke="#6366F1"
            strokeWidth={2}
            points={dailyCounts
              .map((v, i) => `${20 + i * 60},${70 - (v / maxVal) * 50}`)
              .join(' ')}
          />
          {dailyCounts.map((v, i) => (
            <React.Fragment key={i}>
              <circle cx={20 + i * 60} cy={70 - (v / maxVal) * 50} r={4} fill="#6366F1" />
              <text
                x={20 + i * 60}
                y={70 - (v / maxVal) * 50 - 10}
                textAnchor="middle"
                style={{ fontSize: 10, fill: '#6366F1', fontWeight: 600 }}
              >
                {v}
              </text>
              <text
                x={20 + i * 60}
                y={78}
                textAnchor="middle"
                style={{ fontSize: 9, fill: '#9CA3AF' }}
              >
                {labels[i] ?? ''}
              </text>
            </React.Fragment>
          ))}
        </svg>
      </div>
    )
  }, [currentReport])

  const handleGenerate = useCallback(
    (type: 'daily-personal' | 'weekly-team') => {
      generateReport(type)
    },
    [generateReport],
  )

  const handleRetry = useCallback(() => {
    fetchReportList()
  }, [fetchReportList])

  if (isGenerating) {
    return (
      <div style={styles.container}>
        <div style={styles.skeleton}>
          <div style={{ ...styles.skeletonLine, width: '60%' }} />
          <div style={{ ...styles.skeletonLine, width: '100%' }} />
          <div style={{ ...styles.skeletonLine, width: '80%' }} />
          <div style={{ ...styles.skeletonLine, width: '90%' }} />
          <div style={{ ...styles.skeletonLine, width: '40%' }} />
        </div>
      </div>
    )
  }

  if (generateError) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
          <p style={{ color: '#DC2626', marginBottom: 12 }}>{generateError}</p>
          <button style={styles.retryButton} onClick={handleRetry}>
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button
          style={styles.generateButton}
          onClick={() => handleGenerate('daily-personal')}
        >
          生成今日日报
        </button>
        <button
          style={{ ...styles.generateButton, background: '#7C3AED' }}
          onClick={() => handleGenerate('weekly-team')}
        >
          生成本周周报
        </button>
      </div>

      {reports.length > 0 && (
        <div style={styles.reportList}>
          {reports.map((r) => (
            <button
              key={r.filePath}
              style={{
                ...styles.reportItem,
                background: filePath === r.filePath ? '#EEF2FF' : 'transparent',
              }}
              onClick={() => getReport(r.filePath)}
            >
              <span style={styles.reportType}>{r.type === 'daily' ? '日报' : '周报'}</span>
              <span style={styles.reportDate}>{r.date}</span>
            </button>
          ))}
        </div>
      )}

      {(taskChart || commitChart) && (
        <div style={styles.chartsSection}>
          {taskChart}
          {commitChart}
        </div>
      )}

      {currentReport && (
        <div style={styles.markdownContent}>
          {currentReport.split('\n').map((line, i) => {
            if (line.startsWith('# '))
              return <h1 key={i} style={styles.h1}>{line.slice(2)}</h1>
            if (line.startsWith('## '))
              return <h2 key={i} style={styles.h2}>{line.slice(3)}</h2>
            if (line.startsWith('### '))
              return <h3 key={i} style={styles.h3}>{line.slice(4)}</h3>
            if (line.startsWith('- '))
              return <li key={i} style={styles.li}>{renderInlineMarkdown(line.slice(2))}</li>
            if (line.trim() === '') return <br key={i} />
            return <p key={i} style={styles.p}>{line}</p>
          })}
        </div>
      )}

      {!currentReport && reports.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ color: '#9CA3AF' }}>暂无报告。点击上方按钮生成报告。</p>
        </div>
      )}
    </div>
  )
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={styles.code}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    height: '100%',
    overflowY: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
  },
  generateButton: {
    padding: '8px 16px',
    background: '#6366F1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 16,
  },
  reportItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left' as const,
    width: '100%',
  },
  reportType: {
    padding: '2px 8px',
    background: '#EEF2FF',
    color: '#6366F1',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  },
  reportDate: {
    color: '#6B7280',
    fontSize: 13,
  },
  chartsSection: {
    marginBottom: 16,
    borderBottom: '1px solid #E5E7EB',
    paddingBottom: 12,
  },
  markdownContent: {
    lineHeight: 1.7,
    color: '#1F2937',
  },
  h1: {
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 8,
    marginTop: 16,
  },
  h2: {
    fontSize: 16,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
    paddingBottom: 4,
    borderBottom: '1px solid #E5E7EB',
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    color: '#4B5563',
    marginBottom: 4,
    marginTop: 8,
  },
  li: {
    fontSize: 13,
    lineHeight: 1.6,
    marginLeft: 16,
    color: '#374151',
  },
  p: {
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  code: {
    background: '#F3F4F6',
    padding: '1px 4px',
    borderRadius: 3,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  skeleton: {
    padding: 16,
  },
  skeletonLine: {
    height: 14,
    background: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 12,
  },
  errorState: {
    padding: 24,
    textAlign: 'center' as const,
  },
  retryButton: {
    padding: '8px 20px',
    background: '#6366F1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  emptyState: {
    padding: 48,
    textAlign: 'center' as const,
  },
}
