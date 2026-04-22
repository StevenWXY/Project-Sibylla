import { describe, it, expect } from 'vitest'
import { PlanRenderer } from '../../src/main/services/plan/plan-renderer'
import type { PlanMetadata, PlanParseResult } from '../../src/main/services/plan/types'

describe('PlanRenderer', () => {
  const renderer = new PlanRenderer()

  function makeMetadata(overrides: Partial<PlanMetadata> = {}): PlanMetadata {
    return {
      id: 'plan-20260422-120000',
      title: 'Test Plan',
      mode: 'plan',
      status: 'draft',
      createdAt: '2026-04-22T12:00:00Z',
      updatedAt: '2026-04-22T12:00:00Z',
      tags: ['sprint'],
      filePath: '/tmp/plans/plan-20260422-120000.md',
      ...overrides,
    }
  }

  function makeParsed(overrides: Partial<PlanParseResult> = {}): PlanParseResult {
    return {
      parseSuccess: true,
      title: 'Test Plan',
      goal: 'Build feature',
      steps: [
        { text: 'Step 1', done: false },
        { text: 'Step 2', done: true, sectionTitle: 'Phase 2' },
      ],
      risks: ['Risk 1'],
      successCriteria: ['Criteria 1'],
      tags: ['sprint'],
      rawMarkdown: '',
      id: 'plan-20260422-120000',
      ...overrides,
    }
  }

  describe('renderPlan', () => {
    it('should render full plan as valid markdown', () => {
      const md = renderer.renderPlan(makeMetadata(), makeParsed())
      expect(md).toContain('---')
      expect(md).toContain('# Test Plan')
      expect(md).toContain('## 目标')
      expect(md).toContain('## 步骤')
      expect(md).toContain('- [ ] Step 1')
      expect(md).toContain('- [x] Step 2')
      expect(md).toContain('## 风险与备案')
      expect(md).toContain('## 成功标准')
    })
  })

  describe('renderFrontmatter', () => {
    it('should include all required fields', () => {
      const fm = renderer.renderFrontmatter(makeMetadata())
      expect(fm).toContain('id:')
      expect(fm).toContain('title:')
      expect(fm).toContain('mode: plan')
      expect(fm).toContain('status:')
      expect(fm).toContain('created_at:')
      expect(fm).toContain('updated_at:')
      expect(fm).toContain('tags:')
      expect(fm).toMatch(/^---\n/)
      expect(fm).toMatch(/\n---$/)
    })
  })

  describe('renderSteps', () => {
    it('should group steps by sectionTitle', () => {
      const md = renderer.renderSteps([
        { text: 'Default step', done: false },
        { text: 'Phase step', done: false, sectionTitle: 'Phase 1' },
        { text: 'Phase step 2', done: true, sectionTitle: 'Phase 1' },
      ])
      expect(md).toContain('### Phase 1')
      expect(md).toContain('- [ ] Default step')
      expect(md).toContain('- [ ] Phase step')
      expect(md).toContain('- [x] Phase step 2')
    })

    it('should render without sections', () => {
      const md = renderer.renderSteps([
        { text: 'Step A', done: false },
        { text: 'Step B', done: true },
      ])
      expect(md).toContain('- [ ] Step A')
      expect(md).toContain('- [x] Step B')
      expect(md).not.toContain('###')
    })
  })

  describe('renderRisks', () => {
    it('should render risks when present', () => {
      const md = renderer.renderRisks(['Risk A', 'Risk B'])
      expect(md).toContain('## 风险与备案')
      expect(md).toContain('Risk A')
    })

    it('should return empty string when no risks', () => {
      expect(renderer.renderRisks([])).toBe('')
      expect(renderer.renderRisks(undefined)).toBe('')
    })
  })

  describe('renderSuccessCriteria', () => {
    it('should render criteria when present', () => {
      const md = renderer.renderSuccessCriteria(['Criteria A'])
      expect(md).toContain('## 成功标准')
    })

    it('should return empty string when no criteria', () => {
      expect(renderer.renderSuccessCriteria([])).toBe('')
    })
  })

  describe('renderArchivedStub', () => {
    it('should contain archived path reference', () => {
      const stub = renderer.renderArchivedStub(makeMetadata(), '/specs/plans/test.md')
      expect(stub).toContain('status: archived')
      expect(stub).toContain('/specs/plans/test.md')
      expect(stub).toContain('此计划已归档为正式文档')
    })
  })

  describe('updateFrontmatter', () => {
    it('should update existing frontmatter', () => {
      const content = '---\nstatus: draft\n---\n\n# Plan\n\nBody text'
      const updated = renderer.updateFrontmatter(content, { status: 'in_progress' })
      expect(updated).toContain('status: in_progress')
      expect(updated).toContain('# Plan')
      expect(updated).toContain('Body text')
    })

    it('should add frontmatter when none exists', () => {
      const content = '# Plan\n\nBody'
      const updated = renderer.updateFrontmatter(content, { status: 'draft' })
      expect(updated).toContain('---')
      expect(updated).toContain('status: draft')
      expect(updated).toContain('# Plan')
    })
  })
})
