import React, { useState, useCallback } from 'react'
import { useDecisionStore } from '../../store/decisionStore'

interface DecisionOutcomeEditorProps {
  decisionId: string
  currentResult?: string
}

export const DecisionOutcomeEditor: React.FC<DecisionOutcomeEditorProps> = ({
  decisionId,
  currentResult,
}) => {
  const updateOutcome = useDecisionStore((s) => s.updateOutcome)

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(currentResult ?? '')
  const [isSaving, setIsSaving] = useState(false)

  const handleEdit = useCallback(() => {
    setEditValue(currentResult ?? '')
    setIsEditing(true)
  }, [currentResult])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await updateOutcome(decisionId, editValue.trim())
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }, [decisionId, editValue, updateOutcome])

  const handleCancel = useCallback(() => {
    setEditValue(currentResult ?? '')
    setIsEditing(false)
  }, [currentResult])

  if (isEditing) {
    return (
      <div>
        <textarea
          style={styles.textarea}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder="填写实际结果..."
          rows={4}
        />
        <div style={styles.editActions}>
          <button
            style={{
              ...styles.cancelButton,
              opacity: isSaving ? 0.5 : 1,
            }}
            onClick={handleCancel}
            disabled={isSaving}
          >
            取消
          </button>
          <button
            style={{
              ...styles.saveButton,
              opacity: isSaving ? 0.5 : 1,
            }}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  if (currentResult) {
    return (
      <div>
        <p style={styles.resultText}>{currentResult}</p>
        <button style={styles.editButton} onClick={handleEdit}>
          编辑
        </button>
      </div>
    )
  }

  return (
    <div style={styles.placeholder}>
      <span style={styles.placeholderText}>尚未回填实际结果</span>
      <button style={styles.editButton} onClick={handleEdit}>
        填写结果
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  textarea: {
    width: '100%',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
    outline: 'none',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    lineHeight: 1.6,
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 6,
  },
  cancelButton: {
    background: 'none',
    border: '1px solid #E5E7EB',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    color: '#374151',
  },
  saveButton: {
    background: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  resultText: {
    fontSize: 13,
    lineHeight: 1.6,
    margin: '0 0 6px 0',
    color: '#4B5563',
  },
  editButton: {
    background: 'none',
    border: 'none',
    color: '#4F46E5',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
}
