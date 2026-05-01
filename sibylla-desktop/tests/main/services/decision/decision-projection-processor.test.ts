import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DecisionProjectionProcessor } from '@main/services/memory/decision-projection-processor'
import type { ExtractionReport, ExtractionInput } from '@main/services/memory/types'

function makeReport(): ExtractionReport {
  return {
    added: [],
    merged: [],
    discarded: [],
    durationMs: 100,
    tokenCost: { input: 0, output: 0 },
  }
}

function makeContext(): ExtractionInput {
  return {
    logs: [],
    existingMemory: [],
    workspaceContext: { name: 'test' },
  }
}

function writeDecisionFile(dir: string, fileName: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileName), content, 'utf-8')
}

describe('DecisionProjectionProcessor', () => {
  let tmpDir: string
  let processor: DecisionProjectionProcessor
  let memoryDir: string
  let docsDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-projection-test-'))
    memoryDir = path.join(tmpDir, '.sibylla/memory/decisions')
    docsDir = path.join(tmpDir, 'docs/decisions')
    processor = new DecisionProjectionProcessor(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const fullDecisionContent = `---
id: dec_2026_05_01_database_choice
title: 选择主数据库
status: decided
decided_at: 2026-05-01
decided_by: [Alice]
tags: [database, infrastructure]
related_files: []
---

# 选择主数据库

## 问题
项目需要选择一个主数据库，要求支持事务和高并发。

## 选项
### PostgreSQL
- 优势: ACID 合规，成熟生态
- 劣势: 设置复杂

### MySQL
- 优势: 使用广泛，部署简单
- 劣势: JSON 支持较弱

## 决策
**选择: PostgreSQL**

## 理由
PostgreSQL 提供更好的 JSON 支持和扩展性，适合长期发展。

## 实际结果
性能表现优秀，满足预期。
`

  it('projects a new complete decision with correct confidence', () => {
    writeDecisionFile(memoryDir, '2026-05-01-database.md', fullDecisionContent)

    const candidates = processor.process(makeReport(), makeContext())

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.section).toBe('technical_decision')
    expect(candidates[0]?.confidence).toBeCloseTo(1.0, 1)
    expect(candidates[0]?.content).toContain('source: .sibylla/memory/decisions/2026-05-01-database.md')
    expect(candidates[0]?.content).toContain('选择主数据库')
  })

  it('calculates lower confidence when sections are missing', () => {
    const partialContent = `---
id: dec_2026_05_01_partial
title: 部分决策
status: decided
decided_at: 2026-05-01
decided_by: []
tags: []
related_files: []
---

# 部分决策

## 问题
这是一个问题描述。

## 决策
**选择: 方案A**
`
    writeDecisionFile(memoryDir, '2026-05-01-partial.md', partialContent)

    const candidates = processor.process(makeReport(), makeContext())

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.confidence).toBeCloseTo(0.5, 1)
  })

  it('calculates very low confidence when only title exists', () => {
    const minimalContent = `---
id: dec_2026_05_01_minimal
title: 最小决策
status: decided
decided_at: 2026-05-01
decided_by: []
tags: []
related_files: []
---

# 最小决策
`
    writeDecisionFile(memoryDir, '2026-05-01-minimal.md', minimalContent)

    const candidates = processor.process(makeReport(), makeContext())

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.confidence).toBe(0.1)
  })

  it('skips files with broken frontmatter', () => {
    writeDecisionFile(
      memoryDir,
      '2026-05-01-broken.md',
      'This file has no frontmatter at all.',
    )

    const candidates = processor.process(makeReport(), makeContext())

    expect(candidates).toHaveLength(0)
  })

  it('returns empty for empty directories', () => {
    const candidates = processor.process(makeReport(), makeContext())
    expect(candidates).toHaveLength(0)
  })

  it('skips already processed files on second call', () => {
    writeDecisionFile(memoryDir, '2026-05-01-db.md', fullDecisionContent)

    const first = processor.process(makeReport(), makeContext())
    expect(first).toHaveLength(1)

    const second = processor.process(makeReport(), makeContext())
    expect(second).toHaveLength(0)
  })

  it('re-processes updated files', () => {
    writeDecisionFile(memoryDir, '2026-05-01-db.md', fullDecisionContent)

    const first = processor.process(makeReport(), makeContext())
    expect(first).toHaveLength(1)

    fs.writeFileSync(
      path.join(memoryDir, '2026-05-01-db.md'),
      fullDecisionContent + '\nExtra content',
      'utf-8',
    )

    const updated = processor.process(makeReport(), makeContext())
    expect(updated).toHaveLength(1)
  })

  it('scans both memory and docs directories', () => {
    writeDecisionFile(memoryDir, '2026-05-01-mem.md', fullDecisionContent)
    writeDecisionFile(docsDir, '2026-05-01-docs.md', fullDecisionContent)

    const candidates = processor.process(makeReport(), makeContext())

    expect(candidates).toHaveLength(2)
  })

  it('includes back-link in content', () => {
    writeDecisionFile(memoryDir, '2026-05-01-db.md', fullDecisionContent)

    const candidates = processor.process(makeReport(), makeContext())

    expect(candidates[0]?.content).toMatch(/source: .+\.md/)
  })
})
