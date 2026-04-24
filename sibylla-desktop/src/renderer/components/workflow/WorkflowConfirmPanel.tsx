import React, { useCallback } from 'react'
import { Shield, SkipForward, XCircle, CheckCircle, FileText } from 'lucide-react'
import { Button, Modal } from '../ui'
import type { WorkflowConfirmationRequest, StepResult } from '../../../shared/types'

interface WorkflowConfirmPanelProps {
  request: WorkflowConfirmationRequest
  onConfirm: (runId: string, decision: 'confirm' | 'skip' | 'cancel') => void
}

export const WorkflowConfirmPanel: React.FC<WorkflowConfirmPanelProps> = ({ request, onConfirm }) => {
  const { runId, workflowName, step, previousSteps, diffPreview } = request

  const handleDecision = useCallback(
    (decision: 'confirm' | 'skip' | 'cancel') => {
      onConfirm(runId, decision)
    },
    [runId, onConfirm],
  )

  const completedSteps = Object.entries(previousSteps).filter(
    ([, result]) => result.status === 'completed',
  )

  return (
    <Modal onClose={() => handleDecision('cancel')}>
      <div className="w-[560px] max-h-[80vh] overflow-y-auto bg-sys-darkSurface border border-sys-darkBorder rounded-lg shadow-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-sys-darkBorder">
          <Shield className="w-5 h-5 text-status-warning" />
          <h2 className="text-sm font-medium text-white">Workflow 确认</h2>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-xs text-sys-muted">工作流</div>
            <div className="text-sm text-white">{workflowName}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-sys-muted">当前步骤</div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sys-muted" />
              <span className="text-sm text-white">{step.name}</span>
            </div>
            {step.skill && (
              <div className="text-xs text-sys-muted ml-6">Skill: {step.skill}</div>
            )}
            {step.sub_agent && (
              <div className="text-xs text-sys-muted ml-6">Sub-agent: {step.sub_agent}</div>
            )}
            {step.action && (
              <div className="text-xs text-sys-muted ml-6">操作: {step.action}</div>
            )}
          </div>

          {completedSteps.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-sys-muted">前置步骤产出</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {completedSteps.map(([stepId, result]: [string, StepResult]) => (
                  <div
                    key={stepId}
                    className="text-xs bg-white/5 rounded p-2 font-mono text-sys-muted break-all"
                  >
                    <span className="text-white">{stepId}</span>:{' '}
                    {result.output ? JSON.stringify(result.output).slice(0, 200) : '(无输出)'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {diffPreview && (
            <div className="space-y-1">
              <div className="text-xs text-sys-muted">Diff 预览</div>
              <pre className="text-xs bg-black/30 rounded p-3 overflow-x-auto max-h-40 font-mono text-sys-muted">
                {diffPreview}
              </pre>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-sys-darkBorder">
          <Button
            variant="ghost"
            icon={<SkipForward className="w-4 h-4" />}
            onClick={() => handleDecision('skip')}
            className="text-status-warning hover:text-status-warning"
          >
            跳过
          </Button>
          <Button
            variant="ghost"
            icon={<XCircle className="w-4 h-4" />}
            onClick={() => handleDecision('cancel')}
            className="text-status-error hover:text-status-error"
          >
            取消 Workflow
          </Button>
          <Button
            variant="primary"
            icon={<CheckCircle className="w-4 h-4" />}
            onClick={() => handleDecision('confirm')}
          >
            确认执行
          </Button>
        </div>
      </div>
    </Modal>
  )
}
