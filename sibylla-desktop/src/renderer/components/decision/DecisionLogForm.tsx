import React, { useState, useCallback } from 'react'
import { useDecisionStore } from '../../store/decisionStore'
import type { DecisionOption, CreateDecisionInput } from '../../store/decisionStore'

interface DecisionLogFormProps {
  onSubmit: (input: CreateDecisionInput) => Promise<void>
  onCancel: () => void
}

const EMPTY_OPTION: DecisionOption = { name: '', pros: '', cons: '' }

export const DecisionLogForm: React.FC<DecisionLogFormProps> = ({
  onSubmit,
  onCancel,
}) => {
  const createDecision = useDecisionStore((s) => s.createDecision)

  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [options, setOptions] = useState<DecisionOption[]>([{ ...EMPTY_OPTION }, { ...EMPTY_OPTION }])
  const [chosen, setChosen] = useState('')
  const [reason, setReason] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [location, setLocation] = useState<'memory' | 'docs'>('memory')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addOption = useCallback(() => {
    setOptions((prev) => [...prev, { ...EMPTY_OPTION }])
  }, [])

  const removeOption = useCallback((index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateOption = useCallback((index: number, field: keyof DecisionOption, value: string) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt)),
    )
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim() || !chosen) return

      setIsSubmitting(true)
      try {
        const input: CreateDecisionInput = {
          title: title.trim(),
          problem: problem.trim(),
          options: options.filter((o) => o.name.trim()),
          chosen,
          reason: reason.trim(),
          tags: tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          location,
        }
        await createDecision(input)
        await onSubmit(input)
      } finally {
        setIsSubmitting(false)
      }
    },
    [title, problem, options, chosen, reason, tagsInput, location, createDecision, onSubmit],
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>新建决策</h2>
        <button style={styles.cancelButton} onClick={onCancel}>
          取消
        </button>
      </div>

      <form style={styles.form} onSubmit={handleSubmit}>
        <label style={styles.label}>
          <span style={styles.labelText}>标题 *</span>
          <input
            style={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="决策标题"
            required
          />
        </label>

        <label style={styles.label}>
          <span style={styles.labelText}>问题描述</span>
          <textarea
            style={styles.textarea}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="面临的问题或挑战"
            rows={3}
          />
        </label>

        <div style={styles.label}>
          <div style={styles.optionHeader}>
            <span style={styles.labelText}>选项</span>
            <button type="button" style={styles.addOptionButton} onClick={addOption}>
              + 添加选项
            </button>
          </div>
          {options.map((opt, idx) => (
            <div key={idx} style={styles.optionBlock}>
              <div style={styles.optionRow}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  type="text"
                  value={opt.name}
                  onChange={(e) => updateOption(idx, 'name', e.target.value)}
                  placeholder="方案名称"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    style={styles.removeOptionButton}
                    onClick={() => removeOption(idx)}
                  >
                    ×
                  </button>
                )}
              </div>
              <div style={styles.optionFields}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  type="text"
                  value={opt.pros ?? ''}
                  onChange={(e) => updateOption(idx, 'pros', e.target.value)}
                  placeholder="优势"
                />
                <input
                  style={{ ...styles.input, flex: 1 }}
                  type="text"
                  value={opt.cons ?? ''}
                  onChange={(e) => updateOption(idx, 'cons', e.target.value)}
                  placeholder="劣势"
                />
              </div>
            </div>
          ))}
        </div>

        <label style={styles.label}>
          <span style={styles.labelText}>选择方案 *</span>
          <select
            style={styles.select}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            required
          >
            <option value="">-- 选择 --</option>
            {options
              .filter((o) => o.name.trim())
              .map((opt) => (
                <option key={opt.name} value={opt.name}>
                  {opt.name}
                </option>
              ))}
          </select>
        </label>

        <label style={styles.label}>
          <span style={styles.labelText}>理由</span>
          <textarea
            style={styles.textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="选择理由"
            rows={3}
          />
        </label>

        <label style={styles.label}>
          <span style={styles.labelText}>标签</span>
          <input
            style={styles.input}
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="用逗号分隔，如: 数据库, 架构"
          />
        </label>

        <label style={styles.label}>
          <span style={styles.labelText}>存储位置</span>
          <div style={styles.radioGroup}>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="location"
                value="memory"
                checked={location === 'memory'}
                onChange={() => setLocation('memory')}
              />
              <span>个人记忆</span>
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="location"
                value="docs"
                checked={location === 'docs'}
                onChange={() => setLocation('docs')}
              />
              <span>团队文档</span>
            </label>
          </div>
        </label>

        <div style={styles.actions}>
          <button type="button" style={styles.cancelButton} onClick={onCancel}>
            取消
          </button>
          <button
            type="submit"
            style={{
              ...styles.submitButton,
              opacity: isSubmitting || !title.trim() || !chosen ? 0.5 : 1,
            }}
            disabled={isSubmitting || !title.trim() || !chosen}
          >
            {isSubmitting ? '创建中...' : '创建决策'}
          </button>
        </div>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
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
  form: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  labelText: {
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    outline: 'none',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  select: {
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    outline: 'none',
    background: '#FFFFFF',
  },
  optionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addOptionButton: {
    background: 'none',
    border: 'none',
    color: '#4F46E5',
    fontSize: 11,
    cursor: 'pointer',
  },
  optionBlock: {
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  optionRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    marginBottom: 4,
  },
  optionFields: {
    display: 'flex',
    gap: 6,
  },
  removeOptionButton: {
    background: 'none',
    border: 'none',
    color: '#DC2626',
    fontSize: 16,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  radioGroup: {
    display: 'flex',
    gap: 16,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
  cancelButton: {
    background: 'none',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    color: '#374151',
  },
  submitButton: {
    background: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
  },
}
