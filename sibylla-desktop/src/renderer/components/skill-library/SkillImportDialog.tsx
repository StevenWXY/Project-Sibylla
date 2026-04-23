import React, { useState, useCallback } from 'react'
import { Upload, AlertTriangle, X, FileCode } from 'lucide-react'
import { Button, Modal } from '../ui'
import { cn } from '../../utils/cn'

interface SkillImportDialogProps {
  onClose: () => void
  onImported: () => void
}

interface ScanResult {
  name: string
  promptLength: number
  toolList: string[]
  risks: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

function assessRiskLevel(risks: string[]): 'low' | 'medium' | 'high' | 'critical' {
  if (risks.some((r) => r.includes('格式无效'))) return 'critical'
  if (risks.some((r) => r.includes('危险') || r.includes('执行'))) return 'high'
  if (risks.some((r) => r.includes('写入') || r.includes('删除'))) return 'medium'
  return 'low'
}

function scanForRisks(parsed: Record<string, unknown>): string[] {
  const risks: string[] = []

  if (!parsed.id || !parsed.name || !parsed.description) {
    risks.push('⚠️ 缺少必填字段 (id/name/description)')
  }

  if (parsed.prompt && (parsed.prompt as string).length > 10000) {
    risks.push('⚠️ 超长 prompt（可能影响性能）')
  }

  const tools = (parsed.tools ?? parsed.allowed_tools ?? []) as string[]
  if (tools.some((t: string) => t.includes('write') || t.includes('file_write'))) {
    risks.push('⚠️ 包含文件写入操作')
  }
  if (tools.some((t: string) => t.includes('delete') || t.includes('remove'))) {
    risks.push('⚠️ 包含文件删除操作')
  }
  if (tools.some((t: string) => t.includes('exec') || t.includes('shell') || t.includes('bash'))) {
    risks.push('⚠️ 危险：包含命令执行操作')
  }

  const prompt = (parsed.prompt ?? parsed.instructions ?? '') as string
  if (/[<>{}\\]/.test(prompt)) {
    risks.push('⚠️ 包含特殊字符')
  }

  if (prompt.includes('system:') || prompt.includes('ignore previous')) {
    risks.push('⚠️ 包含可能的提示注入内容')
  }

  if (parsed.scope === 'team') {
    risks.push('⚠️ 声明团队范围，需团队同步功能支持')
  }

  return risks
}

export const SkillImportDialog: React.FC<SkillImportDialogProps> = ({ onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [importing, setImporting] = useState(false)

  const handleFileSelect = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.sibylla-skill'
    input.onchange = async (e) => {
      const selected = (e.target as HTMLInputElement).files?.[0]
      if (!selected) return

      setFile(selected)
      setScanning(true)
      setScanResult(null)

      try {
        const content = await selected.text()

        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(content)
        } catch {
          setScanResult({
            name: selected.name,
            promptLength: 0,
            toolList: [],
            risks: ['⚠️ 文件格式无效：不是有效的 JSON 文件'],
            riskLevel: 'critical',
          })
          return
        }

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setScanResult({
            name: selected.name,
            promptLength: 0,
            toolList: [],
            risks: ['⚠️ 文件格式无效：期望 JSON 对象'],
            riskLevel: 'critical',
          })
          return
        }

        const risks = scanForRisks(parsed)
        const riskLevel = assessRiskLevel(risks)

        setScanResult({
          name: parsed.name ?? selected.name,
          promptLength: (parsed.prompt ?? parsed.instructions ?? '').length,
          toolList: parsed.tools ?? parsed.allowed_tools ?? [],
          risks,
          riskLevel,
        })
      } catch {
        setScanResult({
          name: selected.name,
          promptLength: 0,
          toolList: [],
          risks: ['⚠️ 文件格式无效'],
          riskLevel: 'critical',
        })
      } finally {
        setScanning(false)
      }
    }
    input.click()
  }, [])

  const handleImport = useCallback(async () => {
    if (!file) return
    setImporting(true)
    try {
      await window.electronAPI.safeInvoke('ai:skill:import', file.path)
      onImported()
      onClose()
    } catch {
      // silently handle
    } finally {
      setImporting(false)
    }
  }, [file, onImported, onClose])

  return (
    <Modal onClose={onClose}>
      <div className="w-[480px] max-h-[80vh] overflow-y-auto bg-sys-darkSurface border border-sys-darkBorder rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-sys-darkBorder">
          <h2 className="text-sm font-medium text-white">导入 Skill</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-sys-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <button
            onClick={handleFileSelect}
            className={cn(
              'w-full flex flex-col items-center justify-center gap-2 py-8',
              'border-2 border-dashed border-sys-darkBorder rounded-lg',
              'hover:border-white/30 transition-colors cursor-pointer',
            )}
          >
            <Upload className="w-8 h-8 text-sys-muted" />
            <span className="text-sm text-sys-muted">
              {file ? file.name : '选择 .sibylla-skill 文件'}
            </span>
          </button>

          {scanning && (
            <div className="flex items-center justify-center py-4 text-sys-muted text-sm">
              扫描中...
            </div>
          )}

          {scanResult && (
            <div className="space-y-3 rounded-lg border border-sys-darkBorder p-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-sys-muted" />
                <span className="text-sm text-white">{scanResult.name}</span>
              </div>

              <div className="text-xs text-sys-muted space-y-1">
                <div>Prompt 长度: {scanResult.promptLength} 字符</div>
                {scanResult.toolList.length > 0 && (
                  <div>工具列表: {scanResult.toolList.join(', ')}</div>
                )}
              </div>

              {scanResult.risks.length > 0 && (
                <div className="space-y-1">
                  {scanResult.risks.map((risk, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs text-status-warning">
                      <AlertTriangle className="w-3 h-3" />
                      {risk}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-sys-darkBorder">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            loading={importing}
            disabled={!scanResult || scanResult.riskLevel === 'critical'}
          >
            {scanResult && scanResult.riskLevel === 'high' ? '确认导入（有风险）' : '确认导入'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
