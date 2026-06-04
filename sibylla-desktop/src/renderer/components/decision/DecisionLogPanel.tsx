import React, { useEffect, useState, useCallback } from 'react'
import { useDecisionStore } from '../../store/decisionStore'
import type { DecisionLog } from '../../store/decisionStore'
import { DecisionOutcomeEditor } from './DecisionOutcomeEditor'
import { DecisionLogForm } from './DecisionLogForm'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  decided: { label: '已决策', color: '#059669', bg: '#ECFDF5' },
  'in-progress': { label: '进行中', color: '#D97706', bg: '#FFFBEB' },
  reverted: { label: '已回退', color: '#DC2626', bg: '#FEF2F2' },
}

export const DecisionLogPanel: React.FC = () => {
  const decisions = useDecisionStore((s) => s.decisions)
  const selectedDecision = useDecisionStore((s) => s.selectedDecision)
  const isLoading = useDecisionStore((s) => s.isLoading)
  const searchQuery = useDecisionStore((s) => s.searchQuery)
  const error = useDecisionStore((s) => s.error)
  const fetchDecisions = useDecisionStore((s) => s.fetchDecisions)
  const getDecision = useDecisionStore((s) => s.getDecision)
  const setSearchQuery = useDecisionStore((s) => s.setSearchQuery)
  const selectDecision = useDecisionStore((s) => s.selectDecision)

  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')

  useEffect(() => {
    fetchDecisions()
  }, [fetchDecisions])

  const handleSelect = useCallback(
    async (decision: DecisionLog) => {
      await getDecision(decision.id)
      setViewMode('detail')
    },
    [getDecision],
  )

  const handleBack = useCallback(() => {
    selectDecision(null)
    setViewMode('list')
    fetchDecisions()
  }, [selectDecision, fetchDecisions])

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value)
    },
    [setSearchQuery],
  )

  if (isLoading && decisions.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
      </div>
    )
  }

  if (showForm) {
    return (
      <div style={styles.container}>
        <DecisionLogForm
          onSubmit={async () => {
            setShowForm(false)
            await fetchDecisions()
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    )
  }

  if (viewMode === 'detail' && selectedDecision) {
    const statusConfig = STATUS_CONFIG[selectedDecision.status]

    return (
      <div style={styles.container}>
        <div style={styles.detailHeader}>
          <button style={styles.backButton} onClick={handleBack}>
            ← 返回列表
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {statusConfig && (
              <span
                style={{
                  ...styles.statusBadge,
                  color: statusConfig.color,
                  background: statusConfig.bg,
                }}
              >
                {statusConfig.label}
              </span>
            )}
          </div>
        </div>

        <div style={styles.detailContent}>
          <h2 style={styles.detailTitle}>{selectedDecision.title}</h2>

          <div style={styles.metaRow}>
            <span style={styles.metaLabel}>日期</span>
            <span style={styles.metaValue}>{selectedDecision.decidedAt}</span>
            {selectedDecision.decidedBy.length > 0 && (
              <>
                <span style={styles.metaSeparator}>·</span>
                <span style={styles.metaValue}>
                  {selectedDecision.decidedBy.join(', ')}
                </span>
              </>
            )}
          </div>

          {selectedDecision.tags.length > 0 && (
            <div style={styles.tagList}>
              {selectedDecision.tags.map((tag) => (
                <span key={tag} style={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>问题</h3>
            <p style={styles.sectionText}>{selectedDecision.problem}</p>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>选项</h3>
            {selectedDecision.options.map((opt) => (
              <div key={opt.name} style={styles.optionCard}>
                <div style={styles.optionName}>
                  {opt.name}
                  {selectedDecision.chosen === opt.name && (
                    <span style={styles.chosenMark}>✓ 选择</span>
                  )}
                </div>
                {opt.pros && (
                  <div style={{ ...styles.optionDetail, color: '#059669' }}>
                    优势: {opt.pros}
                  </div>
                )}
                {opt.cons && (
                  <div style={{ ...styles.optionDetail, color: '#DC2626' }}>
                    劣势: {opt.cons}
                  </div>
                )}
                {opt.risks && (
                  <div style={{ ...styles.optionDetail, color: '#D97706' }}>
                    风险: {opt.risks}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>理由</h3>
            <p style={styles.sectionText}>{selectedDecision.reason}</p>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>实际结果</h3>
            <DecisionOutcomeEditor
              decisionId={selectedDecision.id}
              currentResult={selectedDecision.actualResult}
            />
          </div>

          {selectedDecision.relatedFiles.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>关联文件</h3>
              {selectedDecision.relatedFiles.map((file) => (
                <div key={file} style={styles.relatedFile}>
                  {file}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>决策日志</h2>
        <button style={styles.createButton} onClick={() => setShowForm(true)}>
          + 新建决策
        </button>
      </div>

      <div style={styles.filterBar}>
        <input
          style={styles.searchInput}
          type="text"
          placeholder="搜索决策..."
          value={searchQuery}
          onChange={handleSearch}
        />
      </div>

      {decisions.length === 0 ? (
        <div style={styles.empty}>暂无决策记录</div>
      ) : (
        <div style={styles.list}>
          {decisions.map((decision) => {
            const statusCfg = STATUS_CONFIG[decision.status]
            return (
              <div
                key={decision.id}
                style={styles.card}
                onClick={() => handleSelect(decision)}
              >
                <div style={styles.cardHeader}>
                  <span style={styles.cardTitle}>{decision.title}</span>
                  {statusCfg && (
                    <span
                      style={{
                        ...styles.statusBadge,
                        color: statusCfg.color,
                        background: statusCfg.bg,
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  )}
                </div>
                <div style={styles.cardMeta}>
                  <span>{decision.decidedAt}</span>
                  {decision.chosen && (
                    <span style={styles.cardChosen}>
                      选择: {decision.chosen}
                    </span>
                  )}
                </div>
                {decision.tags.length > 0 && (
                  <div style={styles.tagList}>
                    {decision.tags.slice(0, 3).map((tag) => (
                      <span key={tag} style={styles.tag}>
                        {tag}
                      </span>
                    ))}
                    {decision.tags.length > 3 && (
                      <span style={styles.tag}>
                        +{decision.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 13,
    color: '#1F2937',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #E5E7EB',
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
  },
  createButton: {
    background: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  filterBar: {
    padding: '8px 16px',
    borderBottom: '1px solid #E5E7EB',
  },
  searchInput: {
    width: '100%',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: 8,
  },
  card: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    cursor: 'pointer',
    transition: 'box-shadow 0.15s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    fontSize: 11,
    color: '#6B7280',
  },
  cardChosen: {
    color: '#4F46E5',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    marginTop: 6,
  },
  tag: {
    fontSize: 10,
    color: '#6B7280',
    background: '#F3F4F6',
    padding: '1px 6px',
    borderRadius: 4,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: '#6B7280',
  },
  error: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: '#DC2626',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: '#9CA3AF',
    fontSize: 13,
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #E5E7EB',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#4F46E5',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
  detailContent: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 12px 0',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  metaLabel: {
    fontWeight: 500,
  },
  metaValue: {},
  metaSeparator: {
    color: '#D1D5DB',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    margin: '0 0 8px 0',
    color: '#374151',
  },
  sectionText: {
    fontSize: 13,
    lineHeight: 1.6,
    margin: 0,
    color: '#4B5563',
  },
  optionCard: {
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  optionName: {
    fontSize: 13,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  chosenMark: {
    fontSize: 10,
    color: '#059669',
    fontWeight: 600,
  },
  optionDetail: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 1.4,
  },
  relatedFile: {
    fontSize: 12,
    color: '#4F46E5',
    padding: '2px 0',
    cursor: 'pointer',
  },
}
