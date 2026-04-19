/**
 * EvaluationDrawer component tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvaluationDrawer } from '../../src/renderer/components/studio/harness/EvaluationDrawer'
import { useHarnessStore } from '../../src/renderer/store/harnessStore'
import type { EvaluationReport } from '../../src/shared/types'

const passReport: EvaluationReport = {
  evaluatorId: 'evaluator-default',
  verdict: 'pass',
  dimensions: {
    factual_consistency: { pass: true, issues: [] },
    spec_compliance: { pass: true, issues: [] },
  },
  criticalIssues: [],
  minorIssues: [],
  rationale: 'All checks passed',
  timestamp: Date.now(),
}

const failReport: EvaluationReport = {
  evaluatorId: 'evaluator-strict',
  verdict: 'fail',
  dimensions: {
    factual_consistency: { pass: true, issues: [] },
    spec_compliance: { pass: false, issues: ['Missing spec reference'] },
  },
  criticalIssues: ['Spec compliance failed'],
  minorIssues: ['Minor formatting issue'],
  rationale: 'Spec compliance check failed due to missing references',
  timestamp: Date.now(),
}

describe('EvaluationDrawer', () => {
  beforeEach(() => {
    useHarnessStore.getState().reset()
  })

  it('renders pass dimensions with checkmarks', () => {
    useHarnessStore.getState().setEvaluations('msg-1', [passReport])
    useHarnessStore.getState().toggleEvaluationDrawer()

    render(<EvaluationDrawer messageId="msg-1" />)

    expect(screen.getByText('质量审查结果')).toBeInTheDocument()
    expect(screen.getByText('通过')).toBeInTheDocument()
  })

  it('renders fail dimensions with red highlight', () => {
    useHarnessStore.getState().setEvaluations('msg-1', [failReport])
    useHarnessStore.getState().toggleEvaluationDrawer()

    render(<EvaluationDrawer messageId="msg-1" />)

    expect(screen.getByText('未通过')).toBeInTheDocument()
    expect(screen.getByText(/Spec compliance failed/)).toBeInTheDocument()
  })

  it('shows panel consensus for multiple evaluator reports', () => {
    useHarnessStore.getState().setEvaluations('msg-1', [passReport, failReport])
    useHarnessStore.getState().setMode('panel')
    useHarnessStore.getState().toggleEvaluationDrawer()

    render(<EvaluationDrawer messageId="msg-1" />)

    expect(screen.getByText(/存在异议/)).toBeInTheDocument()
  })

  it('toggles rationale visibility', () => {
    useHarnessStore.getState().setEvaluations('msg-1', [failReport])
    useHarnessStore.getState().toggleEvaluationDrawer()

    render(<EvaluationDrawer messageId="msg-1" />)

    // Rationale should be hidden by default
    expect(screen.queryByText(failReport.rationale)).not.toBeInTheDocument()

    // Click to expand
    const expandButton = screen.getByText('展开详情')
    fireEvent.click(expandButton)

    expect(screen.getByText(failReport.rationale)).toBeInTheDocument()
  })

  it('does not render when drawer is closed', () => {
    useHarnessStore.getState().setEvaluations('msg-1', [passReport])
    // showEvaluationDrawer defaults to false

    const { container } = render(<EvaluationDrawer messageId="msg-1" />)
    expect(container.firstChild).toBeNull()
  })
})
