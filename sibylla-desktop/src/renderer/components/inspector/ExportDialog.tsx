import React, { useState, useEffect, useCallback } from 'react'
import type { RedactionRuleShared, ExportPreviewShared } from '../../../shared/types'

interface ExportDialogProps {
  traceIds: string[]
  onClose: () => void
}

type ExportStep = 1 | 2 | 3

export const ExportDialog: React.FC<ExportDialogProps> = ({ traceIds, onClose }) => {
  const [step, setStep] = useState<ExportStep>(1)
  const [preview, setPreview] = useState<ExportPreviewShared | null>(null)
  const [customRules, setCustomRules] = useState<RedactionRuleShared[]>([])
  const [outputPath, setOutputPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const runPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.trace.previewExport(traceIds, customRules.length > 0 ? customRules : undefined)
      if (response.success && response.data) {
        setPreview(response.data)
      } else {
        setError(response.error?.message ?? '预检失败')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [traceIds, customRules])

  useEffect(() => {
    if (step === 1) {
      runPreview()
    }
  }, [step, runPreview])

  const handleAddRule = () => {
    setCustomRules(prev => [...prev, {
      id: `custom-${Date.now()}`,
      keyPattern: '',
      valuePattern: '',
      reason: '自定义规则',
    }])
  }

  const handleUpdateRule = (idx: number, updates: Partial<RedactionRuleShared>) => {
    setCustomRules(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r))
  }

  const handleRemoveRule = (idx: number) => {
    setCustomRules(prev => prev.filter((_, i) => i !== idx))
  }

  const handleExport = async () => {
    if (!outputPath) {
      setError('请选择输出路径')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.trace.exportTrace(
        traceIds,
        outputPath,
        customRules.length > 0 ? customRules : undefined,
      )
      if (response.success) {
        setSuccess(true)
      } else {
        setError(response.error?.message ?? '导出失败')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          width: '520px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>导出 Trace</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', padding: '12px 20px 0', gap: '8px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: s <= step ? '#6366F1' : '#E5E7EB',
              transition: 'background 0.2s ease',
            }} />
          ))}
        </div>

        <div style={{ padding: '16px 20px' }}>
          {error && (
            <div style={{ padding: '8px 12px', marginBottom: '12px', background: '#FEF2F2', borderRadius: '6px', color: '#EF4444', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {success ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#10B981' }}>导出成功</div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>{outputPath}</div>
            </div>
          ) : (
            <>
              {/* Step 1: Preview */}
              {step === 1 && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px' }}>步骤 1：脱敏预检</h4>
                  {loading ? (
                    <div style={{ color: '#9CA3AF', fontSize: '13px' }}>加载预检报告...</div>
                  ) : preview ? (
                    <>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
                        共 {preview.spans.length} 个 Span，{preview.redactionReport.length} 个字段将被脱敏
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                        {preview.redactionReport.slice(0, 20).map((entry, idx) => (
                          <div key={idx} style={{ padding: '4px 8px', borderBottom: '1px solid #F3F4F6' }}>
                            <span style={{ color: '#1F2937' }}>{entry.fieldPath}</span>
                            <span style={{ color: '#9CA3AF', marginLeft: '8px' }}>({entry.ruleId}: {entry.reason})</span>
                          </div>
                        ))}
                        {preview.redactionReport.length > 20 && (
                          <div style={{ padding: '4px 8px', color: '#9CA3AF' }}>...还有 {preview.redactionReport.length - 20} 项</div>
                        )}
                      </div>
                    </>
                  ) : null}
                </>
              )}

              {/* Step 2: Custom rules */}
              {step === 2 && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px' }}>步骤 2：自定义脱敏规则</h4>
                  {customRules.map((rule, idx) => (
                    <div key={rule.id} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Key pattern"
                        value={rule.keyPattern ?? ''}
                        onChange={e => handleUpdateRule(idx, { keyPattern: e.target.value || undefined })}
                        style={{ flex: 1, padding: '5px 8px', fontSize: '11px', border: '1px solid #E5E7EB', borderRadius: '4px' }}
                      />
                      <input
                        type="text"
                        placeholder="Value pattern"
                        value={rule.valuePattern ?? ''}
                        onChange={e => handleUpdateRule(idx, { valuePattern: e.target.value || undefined })}
                        style={{ flex: 1, padding: '5px 8px', fontSize: '11px', border: '1px solid #E5E7EB', borderRadius: '4px' }}
                      />
                      <button
                        onClick={() => handleRemoveRule(idx)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '14px' }}
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={handleAddRule}
                    style={{ background: 'none', border: `1px dashed #E5E7EB`, borderRadius: '4px', padding: '6px', width: '100%', cursor: 'pointer', color: '#6B7280', fontSize: '12px' }}
                  >
                    + 添加规则
                  </button>
                </>
              )}

              {/* Step 3: Export */}
              {step === 3 && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px' }}>步骤 3：确认导出</h4>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>输出路径</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        placeholder="选择输出路径..."
                        value={outputPath}
                        onChange={e => setOutputPath(e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '4px' }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                    导出 {traceIds.length} 个 Trace，包含 {customRules.length} 条自定义规则
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {step > 1 && (
              <button
                onClick={() => setStep((step - 1) as ExportStep)}
                style={{ padding: '6px 16px', border: '1px solid #E5E7EB', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#6B7280' }}
              >
                上一步
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((step + 1) as ExportStep)}
                disabled={step === 1 && !preview}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  background: step === 1 && !preview ? '#E5E7EB' : '#6366F1',
                  color: step === 1 && !preview ? '#9CA3AF' : '#FFFFFF',
                }}
              >
                下一步
              </button>
            ) : (
              <button
                onClick={handleExport}
                disabled={loading || !outputPath}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  background: loading || !outputPath ? '#E5E7EB' : '#6366F1',
                  color: loading || !outputPath ? '#9CA3AF' : '#FFFFFF',
                }}
              >
                {loading ? '导出中...' : '确认导出'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportDialog
