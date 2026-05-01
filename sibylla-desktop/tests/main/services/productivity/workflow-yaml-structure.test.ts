import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'

const RESOURCES_DIR = path.resolve(__dirname, '../../../../../../sibylla-desktop/resources')

describe('Workflow YAML 结构', () => {
  describe('daily-personal-report.yaml', () => {
    let workflow: Record<string, unknown>

    beforeAll(() => {
      const content = fs.readFileSync(
        path.join(RESOURCES_DIR, 'workflows/daily-personal-report.yaml'),
        'utf-8',
      )
      workflow = yaml.parse(content) as Record<string, unknown>
    })

    it('可被 YAML parser 正确解析', () => {
      expect(workflow).toBeDefined()
      expect(workflow.id).toBe('daily-personal-report')
    })

    it('scope 为 personal', () => {
      expect(workflow.scope).toBe('personal')
    })

    it('cron 表达式为 "0 18 * * *"', () => {
      const triggers = workflow.triggers as Array<Record<string, unknown>>
      const scheduleTrigger = triggers.find((t) => t.type === 'schedule')
      expect(scheduleTrigger?.cron).toBe('0 18 * * *')
    })

    it('包含 manual 触发器', () => {
      const triggers = workflow.triggers as Array<Record<string, unknown>>
      const manualTrigger = triggers.find((t) => t.type === 'manual')
      expect(manualTrigger).toBeDefined()
    })

    it('步骤 1 使用 sub_agent: doc-summarizer', () => {
      const steps = workflow.steps as Array<Record<string, unknown>>
      expect(steps[0].sub_agent).toBe('doc-summarizer')
      expect(steps[0].on_failure).toBe('stop')
    })

    it('步骤 2 使用 skill: daily-report', () => {
      const steps = workflow.steps as Array<Record<string, unknown>>
      expect(steps[1].skill).toBe('daily-report')
    })

    it('步骤 3 使用 action: internal_notification', () => {
      const steps = workflow.steps as Array<Record<string, unknown>>
      expect(steps[2].action).toBe('internal_notification')
    })

    it('on_workflow_failure notify_user: true', () => {
      const onFailure = workflow.on_workflow_failure as Record<string, unknown>
      expect(onFailure.notify_user).toBe(true)
      expect(onFailure.rollback).toBe(false)
    })
  })

  describe('weekly-team-report.yaml', () => {
    let workflow: Record<string, unknown>

    beforeAll(() => {
      const content = fs.readFileSync(
        path.join(RESOURCES_DIR, 'workflows/weekly-team-report.yaml'),
        'utf-8',
      )
      workflow = yaml.parse(content) as Record<string, unknown>
    })

    it('可被 YAML parser 正确解析', () => {
      expect(workflow).toBeDefined()
      expect(workflow.id).toBe('weekly-team-report')
    })

    it('scope 为 admin', () => {
      expect(workflow.scope).toBe('admin')
    })

    it('cron 表达式为 "0 17 * * 0"', () => {
      const triggers = workflow.triggers as Array<Record<string, unknown>>
      const scheduleTrigger = triggers.find((t) => t.type === 'schedule')
      expect(scheduleTrigger?.cron).toBe('0 17 * * 0')
    })

    it('步骤 1 使用 sub_agent: team-report-curator', () => {
      const steps = workflow.steps as Array<Record<string, unknown>>
      expect(steps[0].sub_agent).toBe('team-report-curator')
      expect(steps[0].on_failure).toBe('stop')
    })

    it('步骤 2 使用 skill: daily-report 且 mode 为 weekly-team', () => {
      const steps = workflow.steps as Array<Record<string, unknown>>
      expect(steps[1].skill).toBe('daily-report')
      const input = steps[1].input as Record<string, unknown>
      expect(input.mode).toBe('weekly-team')
    })

    it('步骤 3 使用 action: internal_notification', () => {
      const steps = workflow.steps as Array<Record<string, unknown>>
      expect(steps[2].action).toBe('internal_notification')
    })

    it('on_workflow_failure notify_user: true', () => {
      const onFailure = workflow.on_workflow_failure as Record<string, unknown>
      expect(onFailure.notify_user).toBe(true)
    })
  })
})
