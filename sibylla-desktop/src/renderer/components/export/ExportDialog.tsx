import React from 'react'
import type { ExportFormatShared, ExportPreviewSharedV2 } from '../../../shared/types'

interface ExportDialogProps {
  conversationId: string
  messageCount: number
  onClose: () => void
}

type Step = 'config' | 'preview' | 'exporting' | 'done'

export const ExportDialog: React.FC<ExportDialogProps> = ({
  conversationId,
  messageCount,
  onClose,
}) => {
  const [format, setFormat] = React.useState<ExportFormatShared>('markdown')
  const [includeMetadata, setIncludeMetadata] = React.useState(true)
  const [includeReferencedFiles, setIncludeReferencedFiles] = React.useState(false)
  const [applyRedaction, setApplyRedaction] = React.useState(true)
  const [preview, setPreview] = React.useState<ExportPreviewSharedV2 | null>(null)
  const [step, setStep] = React.useState<Step>('config')
  const [targetPath, setTargetPath] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [customRules, setCustomRules] = React.useState<Array<{ pattern: string; reason: string }>>([])

  React.useEffect(() => {
    const fetchPreview = async () => {
      try {
        const resp = await window.electronAPI.export.preview(conversationId, {
          format,
          conversationId,
          includeMetadata,
          includeReferencedFiles,
          applyRedaction,
          targetPath: '',
        })
        if (resp.success && resp.data) {
          setPreview(resp.data)
        }
      } catch {
        // Preview fetch is optional
      }
    }
    fetchPreview()
  }, [conversationId, format, includeMetadata, includeReferencedFiles, applyRedaction])

  const handleNext = () => {
    if (step === 'config') setStep('preview')
  }

  const handleBack = () => {
    if (step === 'preview') setStep('config')
    if (step === 'done') setStep('config')
  }

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    setStep('exporting')
    try {
      const resp = await window.electronAPI.export.execute(conversationId, {
        format,
        conversationId,
        includeMetadata,
        includeReferencedFiles,
        applyRedaction,
        customRedactionRules: customRules.map((r) => ({
          id: `custom-${r.pattern}`,
          valuePattern: r.pattern,
          reason: r.reason,
        })),
        targetPath,
      })
      if (resp.success) {
        setStep('done')
      } else {
        setError(resp.error?.message ?? 'Export failed')
        setStep('preview')
      }
    } catch (err) {
      setError(String(err))
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }

  const addCustomRule = () => {
    setCustomRules([...customRules, { pattern: '', reason: '' }])
  }

  const removeCustomRule = (index: number) => {
    setCustomRules(customRules.filter((_, i) => i !== index))
  }

  const updateCustomRule = (index: number, field: 'pattern' | 'reason', value: string) => {
    const updated = [...customRules]
    updated[index] = { ...updated[index], [field]: value }
    setCustomRules(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1a2e] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {step === 'config' && 'Export Conversation'}
            {step === 'preview' && 'Preview'}
            {step === 'exporting' && 'Exporting...'}
            {step === 'done' && 'Export Complete'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sys-darkMuted hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        {step === 'config' && (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-sys-darkMuted">Format</label>
              <div className="flex gap-3">
                {(['markdown', 'json', 'html'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`rounded-lg border px-4 py-2 text-sm ${
                      format === f
                        ? 'border-indigo-500 bg-indigo-500/20 text-white'
                        : 'border-white/10 text-sys-darkMuted hover:bg-white/5'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={includeMetadata} onChange={(e) => setIncludeMetadata(e.target.checked)} className="rounded" />
                Include metadata
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={includeReferencedFiles} onChange={(e) => setIncludeReferencedFiles(e.target.checked)} className="rounded" />
                Include referenced files
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={applyRedaction} onChange={(e) => setApplyRedaction(e.target.checked)} className="rounded" />
                Apply redaction
              </label>
            </div>

            {applyRedaction && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm text-sys-darkMuted">Custom redaction rules</label>
                  <button onClick={addCustomRule} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add rule</button>
                </div>
                {customRules.map((rule, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <input
                      placeholder="Pattern (regex)"
                      value={rule.pattern}
                      onChange={(e) => updateCustomRule(i, 'pattern', e.target.value)}
                      className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/30"
                    />
                    <input
                      placeholder="Reason"
                      value={rule.reason}
                      onChange={(e) => updateCustomRule(i, 'reason', e.target.value)}
                      className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/30"
                    />
                    <button onClick={() => removeCustomRule(i)} className="text-red-400 hover:text-red-300">✕</button>
                  </div>
                ))}
              </div>
            )}

            {preview && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-sys-darkMuted">
                <div>{messageCount} messages, ~{(preview.estimatedSizeBytes / 1024).toFixed(1)} KB</div>
                {preview.detectedSensitiveFields.length > 0 && (
                  <div className="mt-1 text-red-400">
                    {preview.detectedSensitiveFields.length} sensitive fields detected
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-sys-darkMuted">Messages</div>
                <div className="text-lg font-semibold text-white">{preview.messageCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-sys-darkMuted">Est. size</div>
                <div className="text-lg font-semibold text-white">{(preview.estimatedSizeBytes / 1024).toFixed(1)} KB</div>
              </div>
            </div>

            {preview.detectedSensitiveFields.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <div className="mb-1 text-sm font-medium text-red-400">Sensitive fields ({preview.detectedSensitiveFields.length})</div>
                {preview.detectedSensitiveFields.map((f, i) => (
                  <div key={i} className="text-xs text-red-300">
                    {f.rule}: <code>{f.sample}</code>
                  </div>
                ))}
              </div>
            )}

            {preview.referencedFiles.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-1 text-sm text-sys-darkMuted">Referenced files</div>
                {preview.referencedFiles.map((f, i) => (
                  <div key={i} className="font-mono text-xs text-white/70">{f}</div>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm text-sys-darkMuted">Output path</label>
              <div className="flex gap-2">
                <input
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="/path/to/export.md"
                  className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'exporting' && (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        )}

        {step === 'done' && (
          <div className="py-6 text-center">
            <div className="mb-2 text-2xl">✓</div>
            <div className="text-white">Export complete</div>
            <div className="mt-1 text-xs text-sys-darkMuted">{targetPath}</div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {step !== 'config' && step !== 'exporting' && (
            <button onClick={handleBack} className="rounded-lg px-4 py-2 text-sm text-sys-darkMuted hover:bg-white/5">
              Back
            </button>
          )}
          {step === 'config' && (
            <>
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-sys-darkMuted hover:bg-white/5">
                Cancel
              </button>
              <button onClick={handleNext} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600">
                Next
              </button>
            </>
          )}
          {step === 'preview' && (
            <button onClick={handleExport} disabled={!targetPath || loading} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50">
              Export
            </button>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
