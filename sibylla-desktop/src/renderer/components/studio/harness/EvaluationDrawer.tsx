/**
 * EvaluationDrawer — Right-side drawer for evaluation report display
 *
 * Width: 320px, slide-in-right animation (200ms).
 * Shows evaluation dimensions with pass/fail, critical/minor issues,
 * and rationale (collapsed by default).
 *
 * Uses natural language: "质量审查" instead of "evaluation".
 */

import React, { useState } from 'react'
import { useHarnessStore, selectShowEvaluationDrawer } from '../../../store/harnessStore'
import type { EvaluationReport, HarnessMode } from '../../../../shared/types'

interface EvaluationDrawerProps {
  messageId: string
}

/** Dimension display names (natural language) */
const DIMENSION_NAMES: Record<string, string> = {
  factual_consistency: '事实一致性',
  spec_compliance: '规范合规性',
  code_quality: '代码质量',
  completeness: '完整性',
  style_consistency: '风格一致性',
}

export const EvaluationDrawer: React.FC<EvaluationDrawerProps> = ({ messageId }) => {
  const showDrawer = useHarnessStore(selectShowEvaluationDrawer)
  const toggleDrawer = useHarnessStore((s) => s.toggleEvaluationDrawer)
  const evaluations = useHarnessStore((s) => s.getEvaluations(messageId))
  const currentMode = useHarnessStore((s) => s.currentMode)

  if (!showDrawer || evaluations.length === 0) return null

  return (
    <div
      className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-sys-darkBorder bg-[#0A0A0A] shadow-2xl transition-transform duration-200"
      style={{ transform: showDrawer ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sys-darkBorder px-4 py-3">
        <h3 className="text-sm font-semibold text-white">质量审查结果</h3>
        <button
          type="button"
          onClick={toggleDrawer}
          className="text-gray-500 transition-colors hover:text-gray-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Mode label + attempts */}
        <div className="mb-3 flex items-center gap-2">
          <ModeLabel mode={currentMode} />
          <span className="text-xs text-gray-500">
            共 {evaluations.length} 次审查
          </span>
        </div>

        {/* Panel consensus (only for panel mode with multiple reports) */}
        {currentMode === 'panel' && evaluations.length >= 2 && (
          <ConsensusBar evaluations={evaluations} />
        )}

        {/* Evaluation reports */}
        {evaluations.map((report, idx) => (
          <EvaluationReportCard key={`${report.evaluatorId}-${idx}`} report={report} />
        ))}
      </div>
    </div>
  )
}

const ModeLabel: React.FC<{ mode: HarnessMode }> = ({ mode }) => {
  const labels: Record<HarnessMode, string> = {
    single: 'Single',
    dual: 'Dual',
    panel: 'Panel',
  }
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-950/30 px-2 py-0.5 text-[11px] text-indigo-400 border border-indigo-900/40">
      {labels[mode]}
    </span>
  )
}

const ConsensusBar: React.FC<{ evaluations: EvaluationReport[] }> = ({ evaluations }) => {
  const verdicts = evaluations.map((e) => e.verdict)
  const allPass = verdicts.every((v) => v === 'pass')
  const allFail = verdicts.every((v) => v === 'fail')
  const consensus = allPass ? '通过' : allFail ? '拒绝' : '存在异议'
  const color = allPass
    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40'
    : allFail
      ? 'text-red-400 bg-red-950/30 border-red-900/40'
      : 'text-amber-400 bg-amber-950/30 border-amber-900/40'

  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${color}`}>
      共识状态：{consensus}
    </div>
  )
}

const EvaluationReportCard: React.FC<{ report: EvaluationReport }> = ({ report }) => {
  const [showRationale, setShowRationale] = useState(false)

  return (
    <div className="mb-3 rounded-lg border border-sys-darkBorder bg-[#111111] p-3">
      {/* Verdict */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-300">
          {report.evaluatorId}
        </span>
        <span
          className={`text-xs font-medium ${
            report.verdict === 'pass' ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {report.verdict === 'pass' ? '通过' : '未通过'}
        </span>
      </div>

      {/* Dimensions */}
      <div className="mb-2 space-y-1">
        {Object.entries(report.dimensions).map(([key, dim]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{DIMENSION_NAMES[key] ?? key}</span>
            <span className={dim.pass ? 'text-emerald-400' : 'text-red-400'}>
              {dim.pass ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>

      {/* Critical issues */}
      {report.criticalIssues.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-red-400">关键问题</p>
          <ul className="space-y-0.5">
            {report.criticalIssues.map((issue, i) => (
              <li key={i} className="text-[11px] text-red-300/80">
                • {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Minor issues */}
      {report.minorIssues.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-amber-400">次要问题</p>
          <ul className="space-y-0.5">
            {report.minorIssues.map((issue, i) => (
              <li key={i} className="text-[11px] text-amber-300/80">
                • {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rationale (collapsed by default) */}
      {report.rationale && (
        <div>
          <button
            type="button"
            onClick={() => setShowRationale(!showRationale)}
            className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
          >
            {showRationale ? '收起详情' : '展开详情'}
          </button>
          {showRationale && (
            <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
              {report.rationale}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
