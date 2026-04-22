import { describe, it, expect } from 'vitest'
import { PlanParser } from '../../src/main/services/plan/plan-parser'

describe('PlanParser', () => {
  const parser = new PlanParser()

  describe('parsePlanMarkdown', () => {
    it('should parse full plan with all sections', () => {
      const content = `---
id: plan-test-001
title: Test Plan
tags: [sprint, feature]
---

# Test Plan

## 目标

Build the feature

## 步骤

- [ ] Step one（预计 2h，负责：Alice）
- [x] Step two
- [ ] Step three（预计 30m）

### Phase 2

- [ ] Step four
- [x] Step five

## 风险与备案

Risk 1
Risk 2

## 成功标准

Criteria 1
Criteria 2`

      const result = parser.parsePlanMarkdown(content, 'plan-test-001')

      expect(result.parseSuccess).toBe(true)
      expect(result.title).toBe('Test Plan')
      expect(result.goal).toBe('Build the feature')
      expect(result.steps).toHaveLength(5)
      expect(result.tags).toEqual(['sprint', 'feature'])
      expect(result.risks).toEqual(['Risk 1', 'Risk 2'])
      expect(result.successCriteria).toEqual(['Criteria 1', 'Criteria 2'])
    })

    it('should parse plan with frontmatter tags', () => {
      const content = `---
tags: [alpha, beta]
---

# My Plan

## 步骤

- [ ] Do something`

      const result = parser.parsePlanMarkdown(content, 'plan-test')
      expect(result.parseSuccess).toBe(true)
      expect(result.tags).toEqual(['alpha', 'beta'])
    })

    it('should parse plan without frontmatter', () => {
      const content = `# Untitled Plan

## 步骤

- [ ] Step one`

      const result = parser.parsePlanMarkdown(content, 'plan-no-fm')
      expect(result.parseSuccess).toBe(true)
      expect(result.title).toBe('Untitled Plan')
    })

    it('should group steps by section titles', () => {
      const content = `# Plan

## 步骤

- [ ] Default step

### Day 1

- [ ] Day 1 step 1
- [x] Day 1 step 2

### Day 2

- [ ] Day 2 step 1`

      const result = parser.parsePlanMarkdown(content, 'plan-sections')
      expect(result.parseSuccess).toBe(true)
      expect(result.steps).toHaveLength(4)
      expect(result.steps[0].sectionTitle).toBeUndefined()
      expect(result.steps[1].sectionTitle).toBe('Day 1')
      expect(result.steps[2].sectionTitle).toBe('Day 1')
      expect(result.steps[3].sectionTitle).toBe('Day 2')
    })

    it('should correctly parse checkbox states', () => {
      const content = `# Plan

## 步骤

- [ ] unchecked
- [x] checked
- [X] checked upper`

      const result = parser.parsePlanMarkdown(content, 'plan-cb')
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].done).toBe(false)
      expect(result.steps[1].done).toBe(true)
      expect(result.steps[2].done).toBe(true)
    })

    it('should parse inline metadata', () => {
      const content = `# Plan

## 步骤

- [ ] Task（预计 4h，负责：QA）
- [ ] Task2（预计 2d）
- [ ] Task3（预计 45m）`

      const result = parser.parsePlanMarkdown(content, 'plan-meta')
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].estimatedMinutes).toBe(240)
      expect(result.steps[0].owner).toBe('QA')
      expect(result.steps[1].estimatedMinutes).toBe(960)
      expect(result.steps[2].estimatedMinutes).toBe(45)
    })

    it('should return parseSuccess false when no steps found', () => {
      const content = `# Plan

Just some text without steps.`

      const result = parser.parsePlanMarkdown(content, 'plan-empty')
      expect(result.parseSuccess).toBe(false)
      expect(result.steps).toHaveLength(0)
    })

    it('should parse goal section', () => {
      const content = `# Plan

## 目标

Achieve greatness

## 步骤

- [ ] Step`

      const result = parser.parsePlanMarkdown(content, 'plan-goal')
      expect(result.goal).toBe('Achieve greatness')
    })

    it('should parse risks section', () => {
      const content = `# Plan

## 步骤

- [ ] Step

## 风险与备案

Risk A
Risk B`

      const result = parser.parsePlanMarkdown(content, 'plan-risks')
      expect(result.risks).toEqual(['Risk A', 'Risk B'])
    })

    it('should parse success criteria section', () => {
      const content = `# Plan

## 步骤

- [ ] Step

## 成功标准

Criteria A
Criteria B`

      const result = parser.parsePlanMarkdown(content, 'plan-criteria')
      expect(result.successCriteria).toEqual(['Criteria A', 'Criteria B'])
    })

    it('should handle malformed frontmatter gracefully', () => {
      const content = `---
invalid: yaml: [broken
---

# Plan

## 步骤

- [ ] Step`

      const result = parser.parsePlanMarkdown(content, 'plan-bad-fm')
      expect(result.parseSuccess).toBe(true)
    })

    it('should handle multiple duration units', () => {
      const content = `# Plan

## 步骤

- [ ] Task1（预计 1h）
- [ ] Task2（预计 30m）
- [ ] Task3（预计 2d）`

      const result = parser.parsePlanMarkdown(content, 'plan-durations')
      expect(result.steps[0].estimatedMinutes).toBe(60)
      expect(result.steps[1].estimatedMinutes).toBe(30)
      expect(result.steps[2].estimatedMinutes).toBe(960)
    })
  })

  describe('parseFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const fm = parser.parseFrontmatter('---\ntitle: Hello\n---')
      expect(fm).not.toBeNull()
      expect(fm?.title).toBe('Hello')
    })

    it('should return null for missing frontmatter', () => {
      const fm = parser.parseFrontmatter('no frontmatter here')
      expect(fm).toBeNull()
    })
  })

  describe('stripFrontmatter', () => {
    it('should strip frontmatter from content', () => {
      const stripped = parser.stripFrontmatter('---\ntitle: Test\n---\n\n# Body')
      expect(stripped).toContain('# Body')
      expect(stripped).not.toContain('---')
    })
  })

  describe('parsePlanFile', () => {
    it('should parse file with external metadata', () => {
      const content = `---
id: plan-external
status: in_progress
---

# External Plan

## 步骤

- [x] Done step
- [ ] Pending step`

      const result = parser.parsePlanFile(content, {
        id: 'plan-external',
        title: 'External Plan',
        mode: 'plan',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        tags: [],
        filePath: '/tmp/plan.md',
      })

      expect(result).not.toBeNull()
      expect(result?.metadata.id).toBe('plan-external')
      expect(result?.steps).toHaveLength(2)
      expect(result?.steps[0].done).toBe(true)
    })

    it('should return null when no steps found', () => {
      const result = parser.parsePlanFile('# No steps here\n\nJust text.', null)
      expect(result).toBeNull()
    })
  })
})
