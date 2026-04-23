import { describe, it, expect } from 'vitest'
import { WorkflowParser } from '../../../../src/main/services/workflow/WorkflowParser'

describe('WorkflowParser', () => {
  const parser = new WorkflowParser()

  const validYaml = `
id: test-workflow
version: 1.0.0
name: Test Workflow
description: A test workflow
scope: public

triggers:
  - type: file_created
    pattern: "specs/**/*.md"
  - type: manual

steps:
  - id: step1
    name: First step
    skill: test-skill
    input:
      target: "test.md"
  - id: step2
    name: Second step
    sub_agent: test-agent
    input:
      file: "test.md"
    on_failure: continue
    timeout: 300
`

  it('should parse valid YAML into WorkflowDefinition', () => {
    const result = parser.parse(validYaml, '/test/workflow.yaml')

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data?.metadata.id).toBe('test-workflow')
    expect(result.data?.metadata.name).toBe('Test Workflow')
    expect(result.data?.metadata.version).toBe('1.0.0')
    expect(result.data?.steps).toHaveLength(2)
    expect(result.data?.triggers).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('should fail when missing required fields', () => {
    const yaml = `
description: Missing id and name
steps:
  - id: s1
    name: step
`
    const result = parser.parse(yaml, '/test/bad.yaml')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors).toContain('缺少必填字段: id')
    expect(result.errors).toContain('缺少必填字段: version')
    expect(result.errors).toContain('缺少必填字段: name')
  })

  it('should fail when step ids are duplicated', () => {
    const yaml = `
id: dup-test
version: 1.0.0
name: Duplicate Steps
steps:
  - id: dup
    name: Step A
    skill: skill-a
  - id: dup
    name: Step B
    skill: skill-b
`
    const result = parser.parse(yaml, '/test/dup.yaml')

    expect(result.success).toBe(false)
    expect(result.errors).toContain('步骤 id 重复: dup')
  })

  it('should fail when when expression is invalid', () => {
    const yaml = `
id: when-test
version: 1.0.0
name: When Test
steps:
  - id: s1
    name: Step
    when: "invalid !!@# syntax"
    skill: test
`
    const result = parser.parse(yaml, '/test/when.yaml')

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('when 表达式语法错误'))).toBe(true)
  })

  it('should fail when on_failure value is invalid', () => {
    const yaml = `
id: failure-test
version: 1.0.0
name: Failure Test
steps:
  - id: s1
    name: Step
    skill: test
    on_failure: retry
`
    const result = parser.parse(yaml, '/test/failure.yaml')

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('on_failure 值不合法'))).toBe(true)
  })

  it('should render template variables correctly', () => {
    const input = {
      target: '${{ params.file_path }}',
      label: 'File: ${{ params.file_path }}',
    }

    const rendered = parser.renderTemplate(input, {
      params: { file_path: '/specs/test.md' },
      steps: {},
    })

    expect(rendered.target).toBe('/specs/test.md')
    expect(rendered.label).toBe('File: /specs/test.md')
  })

  it('should return empty string for undefined template variables without crashing', () => {
    const input = {
      target: '${{ steps.missing.output.data }}',
    }

    const rendered = parser.renderTemplate(input, {
      params: {},
      steps: {},
    })

    expect(rendered.target).toBe('')
  })

  it('should render step output variables', () => {
    const input = {
      review: '${{ steps.review.output.summary }}',
    }

    const rendered = parser.renderTemplate(input, {
      params: {},
      steps: {
        review: { status: 'completed', output: { summary: 'All good' } },
      },
    })

    expect(rendered.review).toBe('All good')
  })

  it('should fail when rollback is set to true', () => {
    const yaml = `
id: rollback-test
version: 1.0.0
name: Rollback Test
steps:
  - id: s1
    name: Step
    skill: test
on_workflow_failure:
  notify_user: true
  rollback: true
`
    const result = parser.parse(yaml, '/test/rollback.yaml')

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('rollback 必须为 false'))).toBe(true)
  })

  it('should fail when schedule trigger missing cron', () => {
    const yaml = `
id: cron-test
version: 1.0.0
name: Cron Test
triggers:
  - type: schedule
steps:
  - id: s1
    name: Step
    skill: test
`
    const result = parser.parse(yaml, '/test/cron.yaml')

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('cron'))).toBe(true)
  })

  it('should evaluate when expressions correctly', () => {
    const steps = {
      review: {
        status: 'completed' as const,
        output: { findings: ['issue1', 'issue2'] },
      },
    }

    expect(parser.evaluateWhen('${{ steps.review.output.findings.length > 0 }}', steps)).toBe(true)
  })

  it('should return false when when expression references undefined steps', () => {
    const steps = {}

    expect(parser.evaluateWhen('${{ steps.missing.output.count > 0 }}', steps)).toBe(false)
  })
})
