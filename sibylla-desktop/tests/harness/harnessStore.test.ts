/**
 * harnessStore unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useHarnessStore } from '../../src/renderer/store/harnessStore'
import type { EvaluationReport, DegradationWarning } from '../../src/shared/types'

describe('harnessStore', () => {
  beforeEach(() => {
    useHarnessStore.getState().reset()
  })

  describe('mode management', () => {
    it('should default to dual mode', () => {
      expect(useHarnessStore.getState().currentMode).toBe('dual')
    })

    it('should switch mode', () => {
      useHarnessStore.getState().setMode('single')
      expect(useHarnessStore.getState().currentMode).toBe('single')

      useHarnessStore.getState().setMode('panel')
      expect(useHarnessStore.getState().currentMode).toBe('panel')
    })
  })

  describe('evaluation management', () => {
    const mockReport: EvaluationReport = {
      evaluatorId: 'evaluator-default',
      verdict: 'pass',
      dimensions: {},
      criticalIssues: [],
      minorIssues: [],
      rationale: 'All good',
      timestamp: Date.now(),
    }

    it('should store evaluations by message id', () => {
      useHarnessStore.getState().setEvaluations('msg-1', [mockReport])
      expect(useHarnessStore.getState().getEvaluations('msg-1')).toEqual([mockReport])
    })

    it('should return empty array for unknown message id', () => {
      expect(useHarnessStore.getState().getEvaluations('unknown')).toEqual([])
    })

    it('should overwrite evaluations for same message id', () => {
      useHarnessStore.getState().setEvaluations('msg-1', [mockReport])
      const newReport = { ...mockReport, verdict: 'fail' as const }
      useHarnessStore.getState().setEvaluations('msg-1', [newReport])
      expect(useHarnessStore.getState().getEvaluations('msg-1')).toEqual([newReport])
    })
  })

  describe('degradation warnings', () => {
    const warning: DegradationWarning = {
      id: 'warn-1',
      timestamp: Date.now(),
      reason: 'Evaluator timeout',
      originalMode: 'dual',
      degradedTo: 'single',
    }

    it('should push warnings', () => {
      useHarnessStore.getState().pushWarning(warning)
      expect(useHarnessStore.getState().degradationWarnings).toHaveLength(1)
      expect(useHarnessStore.getState().degradationWarnings[0].id).toBe('warn-1')
    })

    it('should dismiss warnings by id', () => {
      useHarnessStore.getState().pushWarning(warning)
      useHarnessStore.getState().pushWarning({ ...warning, id: 'warn-2' })
      useHarnessStore.getState().dismissWarning('warn-1')

      expect(useHarnessStore.getState().degradationWarnings).toHaveLength(1)
      expect(useHarnessStore.getState().degradationWarnings[0].id).toBe('warn-2')
    })
  })

  describe('evaluation drawer', () => {
    it('should toggle drawer visibility', () => {
      expect(useHarnessStore.getState().showEvaluationDrawer).toBe(false)
      useHarnessStore.getState().toggleEvaluationDrawer()
      expect(useHarnessStore.getState().showEvaluationDrawer).toBe(true)
      useHarnessStore.getState().toggleEvaluationDrawer()
      expect(useHarnessStore.getState().showEvaluationDrawer).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useHarnessStore.getState().setMode('panel')
      useHarnessStore.getState().pushWarning({
        id: 'w', timestamp: 0, reason: 'test', originalMode: 'dual', degradedTo: 'single',
      })
      useHarnessStore.getState().toggleEvaluationDrawer()

      useHarnessStore.getState().reset()

      expect(useHarnessStore.getState().currentMode).toBe('dual')
      expect(useHarnessStore.getState().degradationWarnings).toHaveLength(0)
      expect(useHarnessStore.getState().showEvaluationDrawer).toBe(false)
    })
  })

  // === TASK021: Resumeable tasks & guardrail notifications ===

  describe('resumeable tasks (TASK021)', () => {
    const mockTasks = [
      { taskId: 'task-1', goal: 'Build feature', status: 'executing', completedSteps: 2, totalSteps: 5, updatedAt: Date.now() },
      { taskId: 'task-2', goal: 'Fix bug', status: 'awaiting_confirmation', completedSteps: 1, totalSteps: 3, updatedAt: Date.now() },
    ]

    it('should set resumeable tasks and show dialog', () => {
      useHarnessStore.getState().setResumeableTasks(mockTasks)

      expect(useHarnessStore.getState().resumeableTasks).toEqual(mockTasks)
      expect(useHarnessStore.getState().showResumeDialog).toBe(true)
    })

    it('should hide dialog when tasks list is empty', () => {
      useHarnessStore.getState().setResumeableTasks(mockTasks)
      expect(useHarnessStore.getState().showResumeDialog).toBe(true)

      useHarnessStore.getState().setResumeableTasks([])
      expect(useHarnessStore.getState().showResumeDialog).toBe(false)
    })

    it('should toggle resume dialog', () => {
      useHarnessStore.getState().toggleResumeDialog()
      expect(useHarnessStore.getState().showResumeDialog).toBe(true)

      useHarnessStore.getState().toggleResumeDialog()
      expect(useHarnessStore.getState().showResumeDialog).toBe(false)
    })

    it('should reset resumeable tasks on reset()', () => {
      useHarnessStore.getState().setResumeableTasks(mockTasks)
      useHarnessStore.getState().reset()

      expect(useHarnessStore.getState().resumeableTasks).toHaveLength(0)
      expect(useHarnessStore.getState().showResumeDialog).toBe(false)
    })
  })

  describe('guardrail notifications (TASK021)', () => {
    const mockNotification = {
      id: 'notif-1',
      ruleId: 'system-path',
      ruleName: '系统路径保护',
      reason: 'Attempted to write to .git/',
      severity: 'block' as const,
      timestamp: Date.now(),
    }

    it('should add guardrail notification', () => {
      useHarnessStore.getState().addGuardrailNotification(mockNotification)
      expect(useHarnessStore.getState().guardrailNotifications).toHaveLength(1)
      expect(useHarnessStore.getState().guardrailNotifications[0]).toEqual(mockNotification)
    })

    it('should dismiss guardrail notification by ID', () => {
      useHarnessStore.getState().addGuardrailNotification(mockNotification)
      useHarnessStore.getState().addGuardrailNotification({ ...mockNotification, id: 'notif-2' })

      useHarnessStore.getState().dismissGuardrailNotification('notif-1')

      expect(useHarnessStore.getState().guardrailNotifications).toHaveLength(1)
      expect(useHarnessStore.getState().guardrailNotifications[0]?.id).toBe('notif-2')
    })

    it('should reset guardrail notifications on reset()', () => {
      useHarnessStore.getState().addGuardrailNotification(mockNotification)
      useHarnessStore.getState().reset()

      expect(useHarnessStore.getState().guardrailNotifications).toHaveLength(0)
    })
  })
})
