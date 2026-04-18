# Phase 1 Sprint 3.2 - 记忆系统 v2（精选记忆、演化、混合检索）

## 一、概述

### 1.1 目标与价值

将现有记忆系统从 v1（基础日志层）升级到 v2（智能记忆层），让 Sibylla 具备
**持续学习团队工作方式与项目约定**的能力。核心能力：

- 从原始交互日志中**自动提取**高价值信息
- 维持一份**精炼、结构化、带置信度**的 MEMORY.md
- **演化可追溯**：每次记忆变更都有日志
- **主动管理 Token 预算**：压缩、归档、淘汰
- **混合检索**：向量 + 关键词 + 时间衰减

这是 Sibylla 与其他 AI 工具的第二个关键体验差异——不是一次性助手，
而是随时间积累对团队与项目理解的工作伙伴。

### 1.2 与其他 Sprint 的关系

| Sprint | 关系 |
|---|---|
| Sprint 3（前序）| 提供 `memory-manager.ts` v1（基础日志层）。Sprint 3.2 在其上构建 v2 |
| Sprint 3.1（并行 / 前序）| Sprint 3.1 的 Trace 事件需通过 Sprint 3.2 提供的接口写入日志 |
| Sprint 3.3（后续）| 基于本 Sprint 的演化日志与 Trace 接入，构建可观测性与 progress.md |
| Sprint 4（并行 / 后续）| **本 Sprint 吸收并替代 Sprint 4 原需求 2.5、2.6、2.7**。Sprint 4 中记忆相关部分应被移除或重构为引用本 Sprint |

### 1.3 对 Sprint 4 的影响（重要）

Sprint 4 的原需求以下三项**应被移除或重构**：

- 需求 2.5（精选记忆提取）→ 由本 Sprint 需求 3.2.2 替代
- 需求 2.6（心跳检查点）→ 由本 Sprint 需求 3.2.3 替代
- 需求 2.7（向量检索集成）→ 由本 Sprint 需求 3.2.6 替代（且改为本地实现）

Sprint 4 重构后应只保留：
- 需求 2.1（云端语义搜索服务）
- 需求 2.2（上下文引擎 v2，需调整为调用本 Sprint 的记忆索引接口）
- 需求 2.3（AI 对话自动搜索）
- 需求 2.4（搜索 UI 优化）

### 1.4 设计原则

- **本地优先**：记忆内容敏感，默认不上传云端。Embedding 优先使用本地轻量模型
- **增量式提取**：每次检查点只处理新日志，不重跑全量
- **带置信度的记忆**：每条记忆有 0-1 置信度，参与压缩与检索排序
- **用户可干预**：所有自动提取的记忆，用户可编辑、删除、锁定（防止 AI 再修改）
- **演化可追溯**：MEMORY.md 的每次变更都有原因记录
- **失败不丢数据**：提取失败、索引损坏、压缩异常时，原始日志永不丢失

### 1.5 涉及模块

- 模块 15：记忆系统（从 v1 升级到 v2）
- 模块 4：AI 系统（Evaluator 调用、上下文组装消费记忆）
- 模块 7：搜索系统（混合检索接口）
- 新增子系统：记忆演化层（`src/main/services/memory/` 扩展）

### 1.6 里程碑定义

**完成标志：**
- MEMORY.md v2 格式生效，支持 6 个内置 section 与元数据
- 精选记忆提取器可运行，从原始日志产出结构化记忆
- 心跳检查点按"2 小时 OR 50 次交互 OR 关键事件"触发
- 演化日志（CHANGELOG）记录每次 MEMORY.md 变更
- 向量索引可用，混合检索响应 < 200ms
- 压缩机制在 MEMORY.md 超过 12K token 时触发
- 记忆面板 UI 可查看、编辑、锁定记忆条目
- Sprint 3.1 的 Trace 事件可通过 `appendHarnessTrace()` 写入记忆日志

### 1.7 v1 兼容性与迁移策略

本 Sprint 在 v1 基础上构建，必须确保平滑升级，不破坏已稳定运行的 v1 功能。

#### 1.7.1 v1 现状关键约束

| 维度 | v1 现状 | 本 Sprint 处理方式 |
|------|---------|-------------------|
| MEMORY.md 路径 | `workspaceRoot/MEMORY.md` | 迁移至 `.sibylla/memory/MEMORY.md`，旧文件备份为 `MEMORY.v1.bak.md` |
| MEMORY.md 格式 | 纯 Markdown，`## Section` + `- 内容` | 升级为 YAML frontmatter + `<!-- @entry -->` 结构化格式 |
| Section 命名 | 自由中文标题（`当前焦点`、`核心决策`等） | 映射到 6 个固定 `MemorySection` 枚举值 |
| 日志格式 | `.sibylla/memory/daily/YYYY-MM-DD.md`（Markdown） | 新增 JSONL 格式 `.sibylla/memory/logs/YYYY-MM.jsonl`，双写过渡 |
| 日志查询 | `queryDailyLog(date)` 解析 Markdown | 保留 v1 方法，新增 `getLogsSince(timestamp)` 读 JSONL |
| RAG 搜索 | `LocalRagEngine`（JSON 索引 + BM25） | 新增 `MemoryIndexer`（sqlite-vec + FTS5），`LocalRagEngine` 作为 fallback 保留 |
| Embedding | 哈希伪 embedding（128 维） | 真实 ML embedding（384 维，all-MiniLM-L6-v2） |
| 压缩 | 行评分裁剪（`scoreMemoryLine`） | 三阶段智能压缩（淘汰→LLM 合并→归档），保留 v1 作为 fallback |
| IPC 通道 | 6 个（snapshot/update/flush/daily-log:query/rag:search/rag:rebuild） | 新增 18+ 个 v2 通道，v1 通道全部保留 |

#### 1.7.2 迁移原则

1. **v1 IPC 通道与方法签名不变**：所有 v1 通道（`memory:snapshot`, `memory:update` 等）继续工作，内部可能委托到 v2 实现
2. **渐进式迁移**：首次启动检测 v1 格式时自动迁移，无需用户介入
3. **双写过渡期**：日志写入同时写 Markdown（v1）和 JSONL（v2），确保回退安全
4. **降级策略**：任何 v2 子系统（embedding、向量索引、LLM 提取）不可用时，自动降级到 v1 行为
5. **数据不丢失**：迁移前备份原始文件；压缩前创建 24 小时快照

#### 1.7.3 Section 映射表

v1 的中文 section 标题到 v2 `MemorySection` 枚举的映射：

```typescript
const V1_SECTION_MAP: Record<string, MemorySection> = {
  '项目概览': 'project_convention',
  '核心决策': 'technical_decision',
  '当前焦点': 'project_convention',
  '用户偏好': 'user_preference',
  '技术决策': 'technical_decision',
  '常见问题': 'common_issue',
  '项目约定': 'project_convention',
  '风险提示': 'risk_note',
  '关键术语': 'glossary',
}
// 未匹配的 section 统一归入 'project_convention'
```

---

## 二、功能需求

### 需求 3.2.1 - MEMORY.md v2 格式与管理器

**用户故事：** 作为系统，我需要一份结构化、带元数据的精选记忆文件，
以便在上下文组装时快速引用，并在提取器运行时支持增量更新。

#### 功能描述

MEMORY.md v2 采用**带 YAML frontmatter 的分节 Markdown**格式，每个 section
对应一个记忆类别，每条记忆有独立的元数据。

#### 文件格式规范

```markdown
---
version: 2
last_checkpoint: 2026-04-18T10:30:00Z
total_tokens: 9850
entry_count: 42
---

## 用户偏好

<!-- @entry id=pref-001 confidence=0.92 hits=15 updated=2026-04-10 locked=false -->
产品经理倾向使用表格对比多方案，而非长段落叙述。
<!-- source: log-20260405-001, log-20260410-003 -->

<!-- @entry id=pref-002 confidence=0.78 hits=3 updated=2026-04-15 locked=true -->
修改 Spec 文件前，团队约定先在讨论频道同步后再动手。
<!-- source: log-20260415-007 -->

## 技术决策

<!-- @entry id=dec-001 confidence=0.95 hits=22 updated=2026-04-01 locked=false -->
选择 Tiptap 而非 Slate.js 作为编辑器内核，原因：协作扩展成熟度更高。
<!-- source: log-20260320-012, log-20260325-004, log-20260401-001 -->

## 常见问题
...

## 项目约定
...

## 风险提示
...

## 关键术语
...
```

#### 验收标准

1. When system starts, the system shall load MEMORY.md v2 and parse frontmatter + entries into memory
2. When MEMORY.md v1 is detected (no version frontmatter), the system shall auto-migrate to v2 format with default confidence 0.7
3. When MemoryManager writes to MEMORY.md, the system shall use atomic write (temp + rename)
4. When entry metadata is malformed (missing confidence, invalid date), the system shall log warning and use safe defaults
5. When user locks an entry (locked=true), subsequent automatic updates to that entry shall be skipped
6. When MemoryManager queries by section, the system shall return entries sorted by confidence × log(hits + 1)
7. When total_tokens exceeds 12000, the system shall trigger compression (requirement 3.2.5)
8. When MEMORY.md is externally edited while app is running, the system shall detect via file watcher and reload

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/memory/types.ts

export type MemorySection =
  | 'user_preference'
  | 'technical_decision'
  | 'common_issue'
  | 'project_convention'
  | 'risk_note'
  | 'glossary'

export interface MemoryEntry {
  id: string                    // e.g. "pref-001"
  section: MemorySection
  content: string               // the actual memory text
  confidence: number            // 0.0 - 1.0
  hits: number                  // number of times this entry was referenced in context
  createdAt: string             // ISO 8601
  updatedAt: string
  sourceLogIds: string[]        // original log entry ids
  locked: boolean               // if true, auto-updater skips this entry
  tags: string[]
}

export interface MemoryFileMetadata {
  version: 2
  lastCheckpoint: string
  totalTokens: number
  entryCount: number
}

export interface MemoryFileSnapshot {
  metadata: MemoryFileMetadata
  entries: MemoryEntry[]
}
```

```typescript
// sibylla-desktop/src/main/services/memory/memory-file-manager.ts
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export class MemoryFileManager {
  constructor(
    private workspaceRoot: string,
    private fileManager: FileManager,
    private logger: Logger
  ) {}

  async load(): Promise<MemoryFileSnapshot> {
    const path = this.memoryPath()
    if (!await this.fileManager.exists(path)) {
      return this.createEmpty()
    }

    const raw = await this.fileManager.readFile(path)
    const parsed = this.parseMarkdown(raw)
    
    if (parsed.metadata.version !== 2) {
      return await this.migrateFromV1(raw)
    }
    
    return parsed
  }

  async save(snapshot: MemoryFileSnapshot): Promise<void> {
    const content = this.serialize(snapshot)
    await this.fileManager.atomicWrite(this.memoryPath(), content)
  }

  private parseMarkdown(raw: string): MemoryFileSnapshot {
    // Parse YAML frontmatter
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!fmMatch) throw new Error('Invalid MEMORY.md format: missing frontmatter')
    
    const metadata = parseYaml(fmMatch[1]) as MemoryFileMetadata
    const body = fmMatch[2]
    const entries = this.parseEntries(body)
    
    return { metadata, entries }
  }

  private parseEntries(body: string): MemoryEntry[] {
    const entries: MemoryEntry[] = []
    const sections = this.splitBySection(body)
    
    for (const [sectionName, sectionBody] of sections) {
      const section = this.mapSectionName(sectionName)
      if (!section) continue
      
      const entryRegex = /<!-- @entry ([^>]+) -->\n(.+?)(?=<!-- (?:@entry|source:)|$)/gs
      let match
      while ((match = entryRegex.exec(sectionBody)) !== null) {
        try {
          const metadata = this.parseEntryMetadata(match[1])
          const content = match[2].trim()
          entries.push({ ...metadata, section, content })
        } catch (err) {
          this.logger.warn('memory.entry.parse.failed', { err, section })
          // Continue parsing other entries
        }
      }
    }
    
    return entries
  }

  private serialize(snapshot: MemoryFileSnapshot): string {
    const fm = `---\n${stringifyYaml(snapshot.metadata)}---\n\n`
    const body = this.serializeEntries(snapshot.entries)
    return fm + body
  }

  private async migrateFromV1(raw: string): Promise<MemoryFileSnapshot> {
    this.logger.info('memory.migrate.v1.started')
    // v1 is just plain markdown without metadata
    // Convert each paragraph to an entry with default section
    const paragraphs = raw.split(/\n\n+/).filter(p => p.trim())
    
    const entries: MemoryEntry[] = paragraphs.map((p, i) => ({
      id: `migrated-${i.toString().padStart(3, '0')}`,
      section: this.guessSection(p) ?? 'project_convention',
      content: p.trim(),
      confidence: 0.7,
      hits: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceLogIds: [],
      locked: false,
      tags: []
    }))
    
    const snapshot: MemoryFileSnapshot = {
      metadata: {
        version: 2,
        lastCheckpoint: new Date().toISOString(),
        totalTokens: this.estimateTokens(raw),
        entryCount: entries.length
      },
      entries
    }
    
    await this.save(snapshot)
    this.logger.info('memory.migrate.v1.completed', { entryCount: entries.length })
    return snapshot
  }

  private memoryPath(): string {
    return path.join(this.workspaceRoot, '.sibylla/memory/MEMORY.md')
  }
}
```

#### v1 兼容性注意事项

1. **路径迁移**：v1 的 `MEMORY.md` 位于 workspace 根目录，v2 位于 `.sibylla/memory/MEMORY.md`。`migrateFromV1()` 必须在迁移后将旧文件重命名为 `MEMORY.v1.bak.md`（保留 30 天）
2. **getMemorySnapshot 兼容**：v1 的 `MemoryManager.getMemorySnapshot()` 返回 `{ content: string, tokenCount: number, tokenDebt: number }`，此方法签名不变。内部实现改为调用 `MemoryFileManager.load()` 并从 `MemoryFileSnapshot` 中提取对应字段
3. **updateMemory 兼容**：v1 的 `MemoryManager.updateMemory(updates: MemoryUpdate[])` 保留，标记 `@deprecated`，内部转换为 v2 `MemoryEntry` 后委托给 `MemoryFileManager`
4. **Section 映射**：迁移时使用 1.7.3 节的映射表将中文 section 标题转换为 `MemorySection` 枚举

#### 优先级

P0 - 必须完成

---

### 需求 3.2.2 - 精选记忆提取器

**用户故事：** 作为系统，我需要从原始日志中智能提取出值得长期保留的信息，
以便 MEMORY.md 能真正反映"学到了什么"，而非堆积无意义的流水账。

#### 功能描述

精选记忆提取器（MemoryExtractor）是 LLM 驱动的组件，输入一批日志，输出结构化
记忆候选。关键设计：

- **分类优先**：先让 LLM 判断"这条值不值得记住 + 属于哪个 section"
- **增量提取**：只处理本次检查点以来的新日志，不重跑全量
- **去重合并**：新提取的记忆先与现有记忆做相似度匹配，相似则合并（更新 hits、融合内容），不相似才新增
- **置信度评估**：LLM 必须为每条记忆给出 0-1 的置信度，低于阈值的丢弃
- **成本敏感**：默认使用 Claude Haiku 等低成本模型；可配置

#### 验收标准

1. When extractor is triggered with a batch of log entries, the system shall return structured memory candidates within 30 seconds for batches up to 200 logs
2. When a candidate's confidence is below 0.5, the system shall discard it
3. When a candidate is similar (cosine similarity > 0.85 with existing entry) to an existing memory, the system shall merge instead of duplicating
4. When merging, the system shall update hits count, append new source log ids, recalculate confidence as weighted average
5. When extraction LLM call fails, the system shall retry up to 3 times with exponential backoff, then log failure and preserve original logs
6. When extraction produces more than 20 new entries in one batch, the system shall flag for manual review (suspicious - likely over-extraction)
7. When extraction completes, the system shall return an ExtractionReport with counts (added/merged/discarded) and rationale summary
8. When extractor runs, it shall not block the main thread (runs in worker or async queue)

#### 技术规格

> **LogEntry 类型说明**：`ExtractionInput.logs` 中的 `LogEntry` 是 v2 日志条目类型，
> 由新增的 `LogStore`（`.sibylla/memory/logs/*.jsonl`）提供。
> v1 的 `MemoryLogEntry`（Markdown 格式）在双写过渡期后逐步停用。
> `LogEntry` 必须包含 `id` 字段（格式 `log-YYYYMMDD-NNN`）以供 `sourceLogIds` 引用。

```typescript
// sibylla-desktop/src/main/services/memory/types.ts（日志相关）

export interface LogEntry {
  id: string                      // e.g. "log-20260418-001"
  type: MemoryLogType | 'harness_trace'
  timestamp: string
  sessionId: string
  summary: string
  details?: string[]
  tags?: string[]
  relatedFiles?: string[]
  operator?: string
  traceType?: HarnessTraceType    // 仅 harness_trace 类型
  severity?: 'info' | 'warn' | 'error'
}
```

```typescript
// sibylla-desktop/src/main/services/memory/memory-extractor.ts

export interface ExtractionInput {
  logs: LogEntry[]
  existingMemory: MemoryEntry[]
  workspaceContext: { name: string; description?: string }
}

export interface ExtractionCandidate {
  section: MemorySection
  content: string
  confidence: number
  reasoning: string          // why it's worth remembering
  sourceLogIds: string[]
  similarExistingId?: string // if similar to existing, suggested merge target
}

export interface ExtractionReport {
  added: MemoryEntry[]
  merged: Array<{ existing: string; merged: string }>
  discarded: Array<{ candidate: string; reason: string }>
  durationMs: number
  tokenCost: { input: number; output: number }
}

export class MemoryExtractor {
  private readonly SYSTEM_PROMPT = `
You are a memory curator for a long-term AI assistant. Your job is to identify
information in user interaction logs that is worth remembering for future sessions.

Only extract information that meets ALL criteria:
1. It reveals a stable pattern (not a one-off fact)
2. It would help AI behave more appropriately in future similar situations
3. It is not already a universal truth (don't remember "users like fast responses")

Categories:
- user_preference: working habits, communication style, format preferences
- technical_decision: choices made, reasoning, alternatives considered
- common_issue: recurring problems and their solutions
- project_convention: naming rules, workflow rules, team agreements
- risk_note: known pitfalls, things to watch out for
- glossary: project-specific terminology definitions

For each candidate, assign confidence 0.0-1.0:
- 0.9+ : explicitly stated by user multiple times
- 0.7-0.9 : strongly implied, observed in 2+ logs
- 0.5-0.7 : inferred from single strong signal
- <0.5 : weak inference, will be discarded

Output JSON:
{
  "candidates": [
    {
      "section": "user_preference",
      "content": "...",
      "confidence": 0.85,
      "reasoning": "...",
      "sourceLogIds": ["log-001", "log-005"]
    }
  ]
}
  `.trim()

  constructor(
    private aiGateway: AIGatewayClient,
    private similarityIndex: MemoryIndexer,
    private config: ExtractorConfig,
    private logger: Logger
  ) {}

  async extract(input: ExtractionInput): Promise<ExtractionReport> {
    const startTime = Date.now()
    const report: ExtractionReport = {
      added: [],
      merged: [],
      discarded: [],
      durationMs: 0,
      tokenCost: { input: 0, output: 0 }
    }

    try {
      // Step 1: Call LLM for extraction
      const candidates = await this.callExtractionLLM(input)
      
      // Step 2: Filter by confidence
      const highConfidence = candidates.filter(c => c.confidence >= 0.5)
      for (const c of candidates) {
        if (c.confidence < 0.5) {
          report.discarded.push({
            candidate: c.content,
            reason: `confidence ${c.confidence} below threshold 0.5`
          })
        }
      }

      // Step 3: Check for over-extraction
      if (highConfidence.length > 20) {
        this.logger.warn('memory.extract.over_extraction_suspected', {
          count: highConfidence.length
        })
        // Still proceed, but flag for review
      }

      // Step 4: Similarity check with existing memory
      for (const candidate of highConfidence) {
        const similar = await this.findSimilar(candidate, input.existingMemory)
        
        if (similar) {
          const merged = this.mergeEntries(similar, candidate)
          report.merged.push({ existing: similar.id, merged: merged.id })
        } else {
          const newEntry = this.candidateToEntry(candidate)
          report.added.push(newEntry)
        }
      }
      
      report.durationMs = Date.now() - startTime
      return report
      
    } catch (err) {
      this.logger.error('memory.extract.failed', { err })
      throw err
    }
  }

  private async callExtractionLLM(input: ExtractionInput): Promise<ExtractionCandidate[]> {
    const session = this.aiGateway.createSession({ role: 'memory-extractor' })
    try {
      const prompt = this.buildPrompt(input)
      const response = await this.withRetry(
        () => session.chat({
          model: this.config.extractorModel, // default: Claude Haiku
          messages: [
            { role: 'system', content: this.SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          responseFormat: 'json',
          temperature: 0.2
        }),
        3  // max 3 retries
      )
      return JSON.parse(response.content).candidates
    } finally {
      session.close()
    }
  }

  private async findSimilar(
    candidate: ExtractionCandidate,
    existing: MemoryEntry[]
  ): Promise<MemoryEntry | null> {
    // Only compare with entries in the same section
    const sameSection = existing.filter(e => e.section === candidate.section)
    if (sameSection.length === 0) return null

    const candidateEmbedding = await this.similarityIndex.embed(candidate.content)
    let bestMatch: { entry: MemoryEntry; score: number } | null = null

    for (const entry of sameSection) {
      const entryEmbedding = await this.similarityIndex.getOrComputeEmbedding(entry)
      const similarity = this.cosineSimilarity(candidateEmbedding, entryEmbedding)
      
      if (similarity > 0.85 && (!bestMatch || similarity > bestMatch.score)) {
        bestMatch = { entry, score: similarity }
      }
    }
    
    return bestMatch?.entry ?? null
  }

  private mergeEntries(existing: MemoryEntry, candidate: ExtractionCandidate): MemoryEntry {
    if (existing.locked) {
      this.logger.info('memory.merge.skipped.locked', { entryId: existing.id })
      return existing
    }

    return {
      ...existing,
      // Weighted confidence: existing (hits-weighted) vs candidate (fresh)
      confidence: (existing.confidence * existing.hits + candidate.confidence) / (existing.hits + 1),
      hits: existing.hits + 1,
      updatedAt: new Date().toISOString(),
      sourceLogIds: [...new Set([...existing.sourceLogIds, ...candidate.sourceLogIds])],
      // Content: prefer candidate if confidence is significantly higher
      content: candidate.confidence > existing.confidence + 0.15
        ? candidate.content
        : existing.content
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.2.3 - 心跳检查点调度器

**用户故事：** 作为系统，我需要定期触发记忆提取与更新，以便记忆能持续演化，
而不依赖用户手动操作。

#### 功能描述

心跳检查点（CheckpointScheduler）基于四类触发条件：

| 触发类型 | 条件 | 优先级 |
|---|---|---|
| 定时 | 距上次检查点 > 2 小时 | 中 |
| 交互计数 | 用户交互 > 50 次 | 中 |
| 手动 | 用户在记忆面板点击"立即检查" | 高 |
| 关键事件 | 检测到 Spec 文件大幅修改、Sprint 3.1 Guardrail 多次触发同类规则 | 高 |

执行流程：
1. 获取上次检查点以来的日志
2. 调用 MemoryExtractor 产出报告
3. 应用报告到 MEMORY.md
4. 更新向量索引
5. 写入 CHANGELOG
6. 广播完成事件

#### 验收标准

1. When 2 hours elapsed since last checkpoint AND at least 1 log entry exists, the system shall trigger checkpoint
2. When 50 user interactions occurred since last checkpoint, the system shall trigger checkpoint (overrides timer)
3. When user manually triggers via UI, the system shall run checkpoint immediately
4. When a key event occurs (Spec file major edit, repeated Guardrail violation of same rule), the system shall schedule priority checkpoint
5. When checkpoint is already running, subsequent triggers shall be queued (max queue depth 3, further triggers discarded)
6. When checkpoint fails, the system shall retry up to 3 times with exponential backoff (1s, 5s, 30s)
7. When all retries fail, the system shall log failure, preserve original logs, and surface notification in UI
8. When checkpoint runs, it shall not block user interaction (runs in worker thread or async queue)
9. When app is closing, the system shall gracefully abort running checkpoint (save progress, resume on next start)
10. When checkpoint completes, the system shall log summary: "Checkpoint completed: 3 added, 2 merged, 5 discarded (12.3s)"

#### 技术规格

> **日志存储迁移说明**：`CheckpointScheduler` 依赖 `memoryManager.getLogsSince(timestamp)` 获取增量日志，
> 该方法需从新增的 JSONL 日志存储（`.sibylla/memory/logs/*.jsonl`）中读取。
> v1 的 `appendLog()` 写 Markdown 格式日志。迁移策略为**双写过渡**：
> `MemoryManager.appendLog()` 同时写入 v1 Markdown 和 v2 JSONL，`getLogsSince()` 仅读 JSONL。
> `LogStore` 是新增的 JSONL 日志管理类（见下方规格）。

```typescript
// sibylla-desktop/src/main/services/memory/log-store.ts

export class LogStore {
  constructor(
    private workspaceRoot: string,
    private logger: Logger
  ) {}

  async append(entry: LogEntry): Promise<void> {
    const month = entry.timestamp.slice(0, 7)
    const logPath = path.join(
      this.workspaceRoot,
      '.sibylla/memory/logs',
      `${month}.jsonl`
    )
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8')
  }

  async getSince(timestamp: string): Promise<LogEntry[]> {
    const logsDir = path.join(this.workspaceRoot, '.sibylla/memory/logs')
    const files = await fs.readdir(logsDir).catch(() => [] as string[])
    const results: LogEntry[] = []
    
    for (const file of files.filter(f => f.endsWith('.jsonl')).sort()) {
      const content = await fs.readFile(path.join(logsDir, file), 'utf-8')
      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line) as LogEntry
          if (entry.timestamp >= timestamp) {
            results.push(entry)
          }
        } catch { /* skip malformed lines */ }
      }
    }
    return results
  }

  async countByFilter(filter: {
    type?: string
    traceType?: string
    since?: string
    details?: Record<string, unknown>
  }): Promise<number> { /* ... */ }
}
```

```typescript
// sibylla-desktop/src/main/services/memory/checkpoint-scheduler.ts

export type CheckpointTrigger = 'timer' | 'interaction_count' | 'manual' | 'key_event'

export interface CheckpointRecord {
  id: string
  trigger: CheckpointTrigger
  startedAt: string
  completedAt?: string
  status: 'running' | 'success' | 'failed' | 'aborted'
  report?: ExtractionReport
  errorMessage?: string
}

export class CheckpointScheduler {
  private lastCheckpoint: Date = new Date(0)
  private interactionCount: number = 0
  private isRunning: boolean = false
  private queue: CheckpointTrigger[] = []
  private readonly MAX_QUEUE = 3

  constructor(
    private memoryManager: MemoryManager,
    private extractor: MemoryExtractor,
    private indexer: MemoryIndexer,
    private evolutionLog: EvolutionLog,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  start(): void {
    // Timer trigger
    setInterval(() => this.maybeRun('timer'), 60 * 1000) // Check every minute

    // Interaction count trigger
    this.eventBus.on('user-interaction', () => {
      this.interactionCount++
      if (this.interactionCount >= 50) {
        this.maybeRun('interaction_count')
      }
    })

    // Key event trigger
    this.eventBus.on('spec-file-major-edit', () => this.maybeRun('key_event'))
    this.eventBus.on('guardrail-repeated', () => this.maybeRun('key_event'))

    // Manual trigger (via IPC)
    this.eventBus.on('memory:manual-checkpoint', () => this.maybeRun('manual'))
  }

  private async maybeRun(trigger: CheckpointTrigger): Promise<void> {
    if (trigger === 'timer') {
      const elapsed = Date.now() - this.lastCheckpoint.getTime()
      if (elapsed < 2 * 60 * 60 * 1000) return
    }

    if (this.isRunning) {
      if (this.queue.length < this.MAX_QUEUE) {
        this.queue.push(trigger)
        this.logger.info('memory.checkpoint.queued', { trigger, queueDepth: this.queue.length })
      } else {
        this.logger.warn('memory.checkpoint.queue_full_discarded', { trigger })
      }
      return
    }

    await this.run(trigger)
    
    // Process queue
    const next = this.queue.shift()
    if (next) await this.run(next)
  }

  private async run(trigger: CheckpointTrigger): Promise<void> {
    this.isRunning = true
    const record: CheckpointRecord = {
      id: this.generateId(),
      trigger,
      startedAt: new Date().toISOString(),
      status: 'running'
    }
    
    this.eventBus.emit('memory:checkpoint-started', record)

    try {
      const logs = await this.memoryManager.getLogsSince(this.lastCheckpoint)
      if (logs.length === 0) {
        record.status = 'success'
        record.completedAt = new Date().toISOString()
        return
      }

      const existingMemory = await this.memoryManager.getAllEntries()
      
      // Run extraction with retry
      const report = await this.withRetry(
        () => this.extractor.extract({
          logs,
          existingMemory,
          workspaceContext: this.memoryManager.getWorkspaceContext()
        }),
        3
      )

      // Apply to MEMORY.md
      await this.memoryManager.applyExtractionReport(report)
      
      // Update index
      await this.indexer.indexReport(report)
      
      // Log evolution
      await this.evolutionLog.append({
        checkpointId: record.id,
        trigger,
        report,
        timestamp: new Date().toISOString()
      })

      record.status = 'success'
      record.completedAt = new Date().toISOString()
      record.report = report

      this.lastCheckpoint = new Date()
      this.interactionCount = 0

      this.logger.info('memory.checkpoint.completed', {
        trigger,
        added: report.added.length,
        merged: report.merged.length,
        discarded: report.discarded.length,
        durationMs: report.durationMs
      })

    } catch (err) {
      record.status = 'failed'
      record.errorMessage = String(err)
      record.completedAt = new Date().toISOString()
      this.logger.error('memory.checkpoint.failed', { trigger, err })
      this.eventBus.emit('memory:checkpoint-failed', record)
      
    } finally {
      this.isRunning = false
      this.eventBus.emit('memory:checkpoint-completed', record)
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
    const delays = [1000, 5000, 30000]
    let lastErr: unknown
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (attempt < maxAttempts - 1) {
          await this.sleep(delays[attempt])
        }
      }
    }
    throw lastErr
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.2.4 - 记忆演化日志

**用户故事：** 作为用户，我希望能追溯"MEMORY.md 为什么变成现在这样"，
以便在 AI 行为异常时找到根因。

#### 功能描述

演化日志（`.sibylla/memory/CHANGELOG.md`）以追加方式记录每次 MEMORY.md 变更，
包含：

- 变更类型（add / merge / archive / delete）
- 变更前后的条目内容
- 触发原因（来源日志摘要）
- 置信度变化
- 触发者（checkpoint / manual edit / compression）

#### 验收标准

1. When MEMORY.md is modified by any component, the system shall append entry to CHANGELOG.md
2. When CHANGELOG.md exceeds 5000 entries, the system shall rotate to CHANGELOG-{YYYY-MM}.md
3. When user views an entry in memory panel, the system shall show "view history" button linking to relevant CHANGELOG entries
4. When CHANGELOG is malformed or missing, the system shall continue operating (log warning, regenerate header)
5. When user manually edits MEMORY.md via external editor, the file watcher shall detect and append a "manual-edit" entry to CHANGELOG

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/memory/evolution-log.ts

export type EvolutionEventType =
  | 'add'
  | 'update'
  | 'merge'
  | 'archive'
  | 'delete'
  | 'manual-edit'
  | 'lock'
  | 'unlock'

export interface EvolutionEvent {
  id: string
  timestamp: string
  type: EvolutionEventType
  entryId: string
  section: MemorySection
  before?: Partial<MemoryEntry>
  after?: Partial<MemoryEntry>
  trigger: {
    source: 'checkpoint' | 'manual' | 'compression' | 'migration'
    checkpointId?: string
    userId?: string
  }
  rationale?: string
}

export class EvolutionLog {
  private readonly MAX_ENTRIES_PER_FILE = 5000

  constructor(
    private workspaceRoot: string,
    private fileManager: FileManager,
    private logger: Logger
  ) {}

  async append(event: EvolutionEvent): Promise<void> {
    const path = await this.getCurrentLogPath()
    const line = this.formatEvent(event)
    
    try {
      await this.fileManager.appendFile(path, line + '\n')
    } catch (err) {
      this.logger.error('memory.evolution.append.failed', { err })
      // Non-blocking: do not throw
    }
  }

  async query(filter: {
    entryId?: string
    type?: EvolutionEventType
    since?: string
    limit?: number
  }): Promise<EvolutionEvent[]> {
    // ... read all changelog files, parse, filter
  }

  private formatEvent(event: EvolutionEvent): string {
    // Each event is a markdown section for human readability
    return `
## ${event.timestamp} — ${event.type} — ${event.entryId}

- **Section:** ${event.section}
- **Trigger:** ${event.trigger.source}${event.trigger.checkpointId ? ` (${event.trigger.checkpointId})` : ''}
${event.rationale ? `- **Rationale:** ${event.rationale}` : ''}

${event.before ? `### Before\n\`\`\`\n${JSON.stringify(event.before, null, 2)}\n\`\`\`` : ''}
${event.after ? `### After\n\`\`\`\n${JSON.stringify(event.after, null, 2)}\n\`\`\`` : ''}

---
`
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.2.5 - 记忆压缩与归档

**用户故事：** 作为系统，当 MEMORY.md 超过 12K tokens 时，我需要智能压缩，
而不是无节制增长。

#### 功能描述

压缩策略按三阶段执行：

1. **淘汰**：低置信度（< 0.5）且命中次数为 0、年龄 > 30 天 → 直接删除
2. **合并**：相似度 > 0.8 的条目 → 合并为一条（由 LLM 重新措辞）
3. **归档**：命中次数 = 0、年龄 > 90 天 → 移至 ARCHIVE.md（仍可检索）

每次压缩必须有演化日志记录，且整个过程可撤销（保留压缩前快照 24 小时）。

#### 验收标准

1. When MEMORY.md total_tokens exceeds 12000, the system shall trigger compression
2. When compressing, the system shall execute three stages in order (discard → merge → archive)
3. When stage 1 completes but total_tokens still > 10000, proceed to stage 2
4. When stage 2 completes but total_tokens still > 10000, proceed to stage 3
5. When compression reduces below 8000 tokens, the system shall stop (target: 8K-12K range)
6. When compression is running, the system shall preserve a pre-compression snapshot for 24 hours at `.sibylla/memory/snapshots/{timestamp}.md`
7. When user triggers "undo compression" within 24 hours, the system shall restore from snapshot
8. When merging entries, the system shall invoke LLM to produce a coherent combined phrasing
9. When archiving, the system shall move entries to ARCHIVE.md and remove from MEMORY.md, but keep in vector index (so search still finds them)
10. When an entry is locked (locked=true), it shall be exempt from all compression stages

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/memory/memory-compressor.ts

export interface CompressionResult {
  discarded: MemoryEntry[]
  merged: Array<{ original: MemoryEntry[]; merged: MemoryEntry }>
  archived: MemoryEntry[]
  beforeTokens: number
  afterTokens: number
  snapshotPath: string
}

export class MemoryCompressor {
  private readonly TARGET_MIN = 8000
  private readonly TARGET_MAX = 12000
  private readonly TRIGGER_THRESHOLD = 12000

  constructor(
    private memoryManager: MemoryManager,
    private aiGateway: AIGatewayClient,
    private indexer: MemoryIndexer,
    private evolutionLog: EvolutionLog,
    private fileManager: FileManager,
    private logger: Logger
  ) {}

  async compress(): Promise<CompressionResult> {
    const snapshot = await this.createSnapshot()
    let entries = await this.memoryManager.getAllEntries()
    const beforeTokens = this.estimateTokens(entries)
    
    const result: CompressionResult = {
      discarded: [],
      merged: [],
      archived: [],
      beforeTokens,
      afterTokens: 0,
      snapshotPath: snapshot
    }

    // Stage 1: Discard
    const [kept1, discarded] = this.partition(entries, e => this.shouldDiscard(e))
    result.discarded = discarded
    entries = kept1
    
    if (this.estimateTokens(entries) <= this.TARGET_MAX) {
      return await this.finalize(entries, result)
    }

    // Stage 2: Merge similar
    const mergeResult = await this.mergeSimilar(entries)
    entries = mergeResult.entries
    result.merged = mergeResult.merges
    
    if (this.estimateTokens(entries) <= this.TARGET_MAX) {
      return await this.finalize(entries, result)
    }

    // Stage 3: Archive stale
    const archiveResult = await this.archiveStale(entries)
    entries = archiveResult.active
    result.archived = archiveResult.archived
    
    return await this.finalize(entries, result)
  }

  private shouldDiscard(entry: MemoryEntry): boolean {
    if (entry.locked) return false
    const ageDays = this.ageInDays(entry.createdAt)
    return entry.confidence < 0.5 && entry.hits === 0 && ageDays > 30
  }

  private async mergeSimilar(entries: MemoryEntry[]): Promise<{
    entries: MemoryEntry[]
    merges: CompressionResult['merged']
  }> {
    const clusters = await this.clusterBysimilarity(entries, 0.8)
    const merges: CompressionResult['merged'] = []
    const result: MemoryEntry[] = []

    for (const cluster of clusters) {
      if (cluster.length === 1 || cluster.some(e => e.locked)) {
        result.push(...cluster)
        continue
      }

      const merged = await this.llmMerge(cluster)
      merges.push({ original: cluster, merged })
      result.push(merged)
    }
    
    return { entries: result, merges }
  }

  private async llmMerge(cluster: MemoryEntry[]): Promise<MemoryEntry> {
    const session = this.aiGateway.createSession({ role: 'memory-compressor' })
    try {
      const prompt = `Merge the following ${cluster.length} related memory entries into a single coherent entry:\n\n${cluster.map((e, i) => `${i + 1}. ${e.content}`).join('\n\n')}`
      const response = await session.chat({
        model: 'claude-haiku',
        messages: [
          { role: 'system', content: 'You merge related memories into concise, coherent single entries. Preserve all unique information.' },
          { role: 'user', content: prompt }
        ]
      })
      
      return {
        id: `merged-${Date.now()}`,
        section: cluster[0].section,
        content: response.content,
        confidence: cluster.reduce((sum, e) => sum + e.confidence * e.hits, 0) / cluster.reduce((sum, e) => sum + e.hits, 0),
        hits: cluster.reduce((sum, e) => sum + e.hits, 0),
        createdAt: cluster.map(e => e.createdAt).sort()[0],
        updatedAt: new Date().toISOString(),
        sourceLogIds: [...new Set(cluster.flatMap(e => e.sourceLogIds))],
        locked: false,
        tags: [...new Set(cluster.flatMap(e => e.tags))]
      }
    } finally {
      session.close()
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.2.6 - 向量索引与混合检索

**用户故事：** 作为系统，当 AI 需要调用历史记忆时，我希望能用语义相似度
找到相关记忆，而不是只能靠关键词匹配。

#### 功能描述

**本地**向量索引（SQLite + sqlite-vec 或 vectra.js），存储所有 MEMORY.md 和
ARCHIVE.md 条目的 embedding。查询时采用**三维度混合评分**：

```
final_score = 0.6 × cosine(query, entry) + 0.3 × bm25(query, entry) + 0.1 × time_decay(entry)
```

- **隐私原则**：记忆内容绝不上传云端。Embedding 默认用本地轻量模型（如
  `all-MiniLM-L6-v2` 通过 transformers.js 本地运行），可配置切换到云端
  embedding（但用户需显式启用）
- **增量索引**：只索引新增/变更的条目，不重跑全量
- **索引损坏自动重建**：启动时校验索引健康，损坏则重建

#### v1 LocalRagEngine 兼容策略

v1 的 `LocalRagEngine`（JSON 索引 + BM25，覆盖 `.sibylla/memory/archives/`）继续存在，不删除。

**降级链**：`MemoryIndexer.search()` → embedding 不可用时 → 纯 BM25（FTS5）→ FTS5 不可用时 → `LocalRagEngine.search()`

**IPC 通道 `rag:search` 行为变更**：
1. 优先调用 `MemoryIndexer.search()`（混合检索）
2. 如果 `MemoryIndexer` 未初始化（embedding 模型未加载、sqlite-vec 不可用），降级到 `LocalRagEngine.search()`
3. 前端无需感知后端使用哪个实现

**IPC 通道 `rag:rebuild` 行为变更**：
1. 同时触发 `MemoryIndexer.rebuild()` 和 `LocalRagEngine.rebuildIndex()`
2. 返回两个子系统的状态

#### 验收标准

1. When a memory entry is added or updated, the system shall generate embedding and upsert to index within 5 seconds
2. When a memory entry is deleted, the system shall remove from index
3. When user or AI queries memory, the system shall return top K results with combined score (weights configurable, default 0.6/0.3/0.1)
4. When query completes, response time shall be under 200ms for workspaces with < 10000 entries
5. When embedding provider fails, the system shall fall back to BM25-only search and log warning
6. When index is corrupted (e.g. SQLite error), the system shall rebuild by re-embedding all entries (may take minutes, runs in background)
7. When user toggles "use cloud embeddings" in settings, the system shall rebuild index with new provider
8. When archived entries match the query, the system shall include them with a `source: 'archive'` flag

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/memory/embedding-provider.ts

export interface EmbeddingProvider {
  readonly dimension: number
  readonly provider: 'local' | 'cloud'
  embed(texts: string[]): Promise<number[][]>
  isAvailable(): Promise<boolean>
}

// Local implementation using transformers.js
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 384  // all-MiniLM-L6-v2
  readonly provider = 'local' as const
  private model: any  // transformers.js pipeline

  async initialize(): Promise<void> {
    const { pipeline } = await import('@xenova/transformers')
    this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map(t => this.model(t, { pooling: 'mean', normalize: true }))
    )
    return results.map(r => Array.from(r.data))
  }

  async isAvailable(): Promise<boolean> {
    return this.model !== null
  }
}
```

```typescript
// sibylla-desktop/src/main/services/memory/memory-indexer.ts

export class MemoryIndexer {
  constructor(
    private db: SQLiteDB,  // using better-sqlite3 + sqlite-vec
    private embeddingProvider: EmbeddingProvider,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    // Load sqlite-vec extension
    this.db.loadExtension('vec0')
    
    // Create schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        section TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL,
        hits INTEGER,
        created_at TEXT,
        updated_at TEXT,
        is_archived INTEGER DEFAULT 0
      );
      
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
        embedding float[${this.embeddingProvider.dimension}]
      );
      
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        id, content, section,
        tokenize='unicode61'
      );
    `)
    
    // Verify index health
    await this.verifyHealth()
  }

  async upsert(entry: MemoryEntry, isArchived: boolean = false): Promise<void> {
    const [embedding] = await this.embeddingProvider.embed([entry.content])
    
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO memory_entries 
        (id, section, content, confidence, hits, created_at, updated_at, is_archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(entry.id, entry.section, entry.content, entry.confidence,
             entry.hits, entry.createdAt, entry.updatedAt, isArchived ? 1 : 0)
      
      this.db.prepare(`
        INSERT OR REPLACE INTO memory_vec (rowid, embedding)
        VALUES ((SELECT rowid FROM memory_entries WHERE id = ?), ?)
      `).run(entry.id, Buffer.from(new Float32Array(embedding).buffer))
      
      this.db.prepare(`
        INSERT OR REPLACE INTO memory_fts (id, content, section)
        VALUES (?, ?, ?)
      `).run(entry.id, entry.content, entry.section)
    })()
  }

  async search(query: string, options: SearchOptions): Promise<HybridSearchResult[]> {
    const [queryEmbedding] = await this.embeddingProvider.embed([query])
    const limit = options.limit ?? 10
    
    // Hybrid query combining vector + FTS + time decay
    const results = this.db.prepare(`
      WITH vec_results AS (
        SELECT 
          m.id,
          m.section,
          m.content,
          m.confidence,
          m.hits,
          m.updated_at,
          m.is_archived,
          (1 - vec_distance_cosine(v.embedding, ?)) as vec_score
        FROM memory_vec v
        JOIN memory_entries m ON v.rowid = m.rowid
        WHERE v.embedding MATCH ?
        LIMIT ${limit * 3}
      ),
      fts_results AS (
        SELECT 
          id,
          bm25(memory_fts) as bm25_score
        FROM memory_fts
        WHERE memory_fts MATCH ?
        LIMIT ${limit * 3}
      )
      SELECT 
        v.id,
        v.section,
        v.content,
        v.confidence,
        v.hits,
        v.is_archived,
        v.vec_score,
        COALESCE(f.bm25_score, 0) as bm25_score,
        (
          0.6 * v.vec_score +
          0.3 * (COALESCE(f.bm25_score, 0) / 10) +
          0.1 * (1.0 / (1 + (julianday('now') - julianday(v.updated_at)) / 30))
        ) as final_score
      FROM vec_results v
      LEFT JOIN fts_results f ON v.id = f.id
      ORDER BY final_score DESC
      LIMIT ?
    `).all(
      Buffer.from(new Float32Array(queryEmbedding).buffer),
      Buffer.from(new Float32Array(queryEmbedding).buffer),
      query,
      limit
    )
    
    return results as HybridSearchResult[]
  }

  async rebuild(): Promise<void> {
    this.logger.info('memory.index.rebuild.started')
    this.db.exec('DELETE FROM memory_vec; DELETE FROM memory_fts;')
    
    const entries = await this.memoryManager.getAllEntries()
    const archived = await this.memoryManager.getAllArchivedEntries()
    
    // Batch embed for efficiency
    const batchSize = 32
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const embeddings = await this.embeddingProvider.embed(batch.map(e => e.content))
      for (let j = 0; j < batch.length; j++) {
        await this.upsert(batch[j], false)
      }
    }
    
    for (const entry of archived) {
      await this.upsert(entry, true)
    }
    
    this.logger.info('memory.index.rebuild.completed', {
      count: entries.length + archived.length
    })
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.2.7 - 记忆面板 UI

**用户故事：** 作为用户，我想要一个可视化面板查看 AI 对我的"记忆"，
并能编辑或删除其中不准确的条目。

#### 功能描述

记忆面板是渲染进程的独立视图，位于现有 Studio 或独立标签页。功能：

- 按 section 分组展示所有记忆条目
- 每条显示：内容、置信度可视化（进度条）、命中次数、最后更新时间、来源日志
- 操作按钮：编辑（修改内容）、删除、锁定（防止自动修改）、查看演化历史
- 搜索框（混合检索）
- 手动触发"立即检查点"按钮
- 压缩状态提示（"当前 9.2K / 12K tokens"）

#### 验收标准

1. When user opens memory panel, the system shall display all entries grouped by section, sorted by confidence × log(hits + 1)
2. When user clicks an entry, the system shall show detail drawer with all metadata and source log links
3. When user edits an entry content, the system shall save and append evolution log entry with type='manual-edit'
4. When user clicks "lock", the system shall set locked=true and display lock icon
5. When user clicks "delete", the system shall prompt confirmation then remove entry from MEMORY.md and index
6. When user searches in panel, the system shall invoke hybrid search and highlight matches
7. When user clicks "run checkpoint now", the system shall trigger manual checkpoint and show progress indicator
8. When checkpoint is running elsewhere (triggered by timer), the panel shall show live status
9. When total tokens approach 12K, the panel shall show warning with "compress now" button

#### 技术规格

```typescript
// sibylla-desktop/src/renderer/store/memoryStore.ts

interface MemoryStore {
  entries: MemoryEntry[]
  archivedEntries: MemoryEntry[]
  totalTokens: number
  lastCheckpoint: Date | null
  isCheckpointRunning: boolean
  
  loadEntries: () => Promise<void>
  searchEntries: (query: string) => Promise<HybridSearchResult[]>
  editEntry: (id: string, newContent: string) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  lockEntry: (id: string, locked: boolean) => Promise<void>
  triggerCheckpoint: () => Promise<void>
  triggerCompression: () => Promise<void>
  getEvolutionHistory: (entryId: string) => Promise<EvolutionEvent[]>
}
```

```typescript
// sibylla-desktop/src/renderer/components/memory/MemoryPanel.tsx

export function MemoryPanel() {
  const {
    entries,
    totalTokens,
    isCheckpointRunning,
    loadEntries,
    triggerCheckpoint
  } = useMemoryStore()
  
  useEffect(() => { loadEntries() }, [])

  const sections: MemorySection[] = [
    'user_preference',
    'technical_decision',
    'common_issue',
    'project_convention',
    'risk_note',
    'glossary'
  ]

  return (
    <div className="memory-panel">
      <MemoryHeader 
        totalTokens={totalTokens}
        threshold={12000}
        isCheckpointRunning={isCheckpointRunning}
        onRunCheckpoint={triggerCheckpoint}
      />
      <MemorySearchBar />
      {sections.map(section => (
        <MemorySection 
          key={section} 
          section={section}
          entries={entries.filter(e => e.section === section)}
        />
      ))}
    </div>
  )
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.2.8 - Trace 信号接入（与 Sprint 3.1 衔接）

**用户故事：** 作为 Sprint 3.1 Harness，我需要将运行时发生的 Guardrail 拦截、
Sensor 信号、Evaluator 评审等事件写入记忆日志，以便后续可被精选记忆提取
与 Sprint 3.3 的 Trace 系统消费。

#### 功能描述

为 Sprint 3.1 提供结构化的 Trace 事件写入接口。Trace 事件以特殊日志条目形式
存储在原始日志中（`.sibylla/memory/logs/`），带有可索引的 `trace_type` 标签。

#### 验收标准

1. When Sprint 3.1 component calls `appendHarnessTrace(event)`, the system shall persist the event to log store
2. When trace events accumulate (e.g. same Guardrail triggered 5+ times within 1 day), the system shall emit `key_event` to trigger priority checkpoint
3. When memory extractor processes logs, it shall recognize trace events and consider them as high-signal inputs (e.g. repeated Guardrail violations → "project convention" candidate)
4. When user queries trace events via memory panel, the system shall return filtered view with timeline
5. When trace event write fails, the system shall not block Harness execution (log warning only)

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/memory/types.ts (扩展)

export type HarnessTraceType =
  | 'guardrail_triggered'
  | 'sensor_signal'
  | 'evaluator_verdict'
  | 'mode_degraded'
  | 'task_state_change'

export interface HarnessTraceEvent {
  id: string
  traceType: HarnessTraceType
  timestamp: string
  sessionId: string
  taskId?: string
  details: Record<string, unknown>  // type-specific payload
  severity: 'info' | 'warn' | 'error'
}
```

```typescript
// sibylla-desktop/src/main/services/memory-manager.ts (扩展 v1 接口)

export class MemoryManager {
  // ... existing v1 methods
  
  // New v2 method for Sprint 3.1
  async appendHarnessTrace(event: HarnessTraceEvent): Promise<void> {
    try {
      await this.logStore.append({
        type: 'harness_trace',
        traceType: event.traceType,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        taskId: event.taskId,
        content: JSON.stringify(event.details),
        severity: event.severity
      })
      
      // Check for patterns that should trigger priority checkpoint
      await this.detectKeyEvents(event)
      
    } catch (err) {
      this.logger.warn('memory.trace.append.failed', { err, event })
      // Non-blocking: do not throw
    }
  }

  private async detectKeyEvents(event: HarnessTraceEvent): Promise<void> {
    if (event.traceType === 'guardrail_triggered') {
      const ruleId = event.details.ruleId as string
      const recent = await this.logStore.countByFilter({
        type: 'harness_trace',
        traceType: 'guardrail_triggered',
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        details: { ruleId }
      })
      
      if (recent >= 5) {
        this.eventBus.emit('guardrail-repeated', { ruleId, count: recent })
      }
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

## 三、非功能需求

### 3.1 性能要求

- 精选记忆提取 < 30 秒（批次 ≤ 200 条日志）
- 心跳检查点总耗时 < 60 秒（含提取、索引更新、演化日志）
- 混合检索响应 < 200ms（workspace 条目数 < 10000）
- 向量索引单条 upsert < 50ms
- MEMORY.md 加载 < 100ms
- 压缩执行 < 90 秒（含 LLM 合并调用）

### 3.2 可靠性要求

- 提取失败不丢失原始日志（先处理，再标记 checkpoint）
- 向量索引损坏时自动重建，不影响主流程
- 压缩前必须创建 24 小时快照，可撤销
- Trace 事件写入失败不阻塞 Harness 执行
- 心跳检查点失败重试 3 次，最终失败留原始日志供下次处理

### 3.3 隐私与安全要求

- 记忆内容默认**绝不上传云端**，即使 Sprint 4 部署也不传
- Embedding 默认本地生成，云端 embedding 需用户显式开启
- MEMORY.md 受个人空间隔离约束（遵循 CLAUDE.md 个人空间规则）
- 手动编辑权限：Admin 全部条目，Editor 仅本人锁定条目
- 演化日志永久保留，支持审计

### 3.4 可配置性要求

- 心跳触发条件可配置（时间间隔、交互次数阈值）
- Extractor 模型可配置（默认 Claude Haiku，可切 GPT-4o-mini 等）
- 混合检索权重可配置（默认 0.6/0.3/0.1）
- Embedding 提供商可选（local / cloud）
- 压缩阈值可配置（默认 12K / 目标 8K-12K）

### 3.5 可观测性要求

- 所有 checkpoint 记录持久化到 `.sibylla/memory/checkpoints.jsonl`
- 所有压缩记录持久化到 `.sibylla/memory/compressions.jsonl`
- 扩展现有日志格式支持 Trace 事件标签
- 面向 Sprint 3.3 Trace 系统提供标准事件流

---

## 四、技术约束

### 4.1 架构约束

- 延续现有 `memory-manager.ts`，不重写；v2 组件位于 `memory/` 子目录
- 所有记忆组件位于主进程 `src/main/services/memory/`
- 向量存储使用**本地** SQLite + sqlite-vec（或 vectra.js 作为备选）
- Embedding 使用 `@xenova/transformers` 本地运行 `all-MiniLM-L6-v2`
- 异步任务通过 Node.js worker_threads 或独立事件循环，不阻塞主进程 IPC

### 4.2 与现有模块的集成

#### 4.2.1 MemoryManager 门面改造

**文件**：`src/main/services/memory-manager.ts`

**改造策略**：扩展为 v2 门面，内部委托到 `memory/` 子目录组件。**所有 v1 公开方法签名保持不变**。

| 方法 | 改造方式 |
|------|---------|
| `setWorkspacePath(path)` | 不变 |
| `appendLog(entry)` | **双写**：保留 v1 Markdown 写入 + 新增 `LogStore.append()` JSONL 写入 |
| `getMemorySnapshot()` | 不变签名，内部改为调用 `MemoryFileManager.load()` 并映射返回值 |
| `updateMemory(updates)` | 标记 `@deprecated`，内部转换为 `MemoryEntry` 后委托 `MemoryFileManager.save()` |
| `flushIfNeeded(...)` | 保留逻辑，触发条件不变 |
| `queryDailyLog(date)` | 不变（仍读 Markdown 日志） |
| **新增** `appendHarnessTrace(event)` | 写入 `LogStore` + 检测关键事件 |
| **新增** `search(query, options)` | 委托 `MemoryIndexer.search()`，降级到 `LocalRagEngine` |
| **新增** `getLogsSince(timestamp)` | 委托 `LogStore.getSince()` |
| **新增** `getAllEntries()` | 委托 `MemoryFileManager.load()` → 返回 `entries` |
| **新增** `applyExtractionReport(report)` | 委托 `MemoryFileManager` + `MemoryIndexer` + `EvolutionLog` |
| **新增** `getWorkspaceContext()` | 返回 `{ name, description? }` |
| **新增** `compress()` | 委托 `MemoryCompressor.compress()` |
| **新增** `getAllArchivedEntries()` | 从 `ARCHIVE.md` 读取 |

**新增依赖注入**：构造函数新增可选参数 `v2Components?: { fileManager: MemoryFileManager, logStore: LogStore, indexer: MemoryIndexer, extractor: MemoryExtractor, compressor: MemoryCompressor, evolutionLog: EvolutionLog, scheduler: CheckpointScheduler }`，不传则 v2 功能降级到 v1 行为。

#### 4.2.2 ContextEngine 记忆层集成

**文件**：`src/main/services/context-engine.ts`

**现状**：`ContextEngine` 构造函数接收 `MemoryManager`，但 `assembleContext()` 不调用任何记忆方法。记忆内容在 `AIHandler` 中以 `compactMemoryContext`（截断 5000 字符）注入 system prompt。

**改造方案**：

1. 在 `assembleContext()` 中新增第 4 层上下文 `memory`（对应 `ContextLayerType = 'always' | 'manual' | 'skill' | 'memory'`）
2. 调用 `memoryManager.search(userMessage, { limit: 5 })` 获取语义相关记忆
3. Token 预算重分配：`always 55% / memory 15% / skill 15% / manual 15%`
4. **降级策略**：如果 `MemoryIndexer` 不可用（embedding 未加载），回退到 v1 的硬编码截断策略（在 `AIHandler` 中注入）

**共享类型变更**（`src/shared/types.ts`）：

```typescript
// ContextLayerType 新增 'memory'
export type ContextLayerType = 'always' | 'manual' | 'skill' | 'memory'
```

#### 4.2.3 AIHandler 注入逻辑迁移

**文件**：`src/main/ipc/handlers/ai.handler.ts`

**现状**：`handleStream` 中手动获取 `memorySnapshot.content` 截断 5000 字符注入 system prompt，`queryRagSafely` 调用 `ragEngine.search()`。

**改造方案**：

1. 移除手动记忆截断逻辑（`compactMemoryContext`）
2. 记忆注入改为由 `ContextEngine` 的 memory 层负责
3. `queryRagSafely` 改为优先调用 `MemoryIndexer.search()`，fallback 到 `ragEngine`
4. 构造函数新增 `memoryIndexer: MemoryIndexer` 依赖注入
5. `getMemorySnapshot()` 返回值中附加 `entryCount`、`lastCheckpoint` 等新字段

#### 4.2.4 AiGatewayClient Session 接口

**文件**：`src/main/services/ai-gateway-client.ts`

**现状**：仅有 `chatStream()` 和 `chat()` 方法，无 session 抽象。

**新增接口**：

```typescript
export interface AiGatewaySession {
  chat(request: Omit<AiGatewayChatRequest, 'stream'>): Promise<AiGatewayChatResponse>
  close(): void
}

export class AiGatewayClient {
  // ... existing methods unchanged

  createSession(options: { role: string }): AiGatewaySession {
    return new AiGatewaySessionImpl(this, options.role)
  }
}

class AiGatewaySessionImpl implements AiGatewaySession {
  constructor(
    private client: AiGatewayClient,
    private role: string
  ) {}

  async chat(request: Omit<AiGatewayChatRequest, 'stream'>): Promise<AiGatewayChatResponse> {
    return this.client.chat({
      ...request,
      stream: false
    })
  }

  close(): void {
    // Session cleanup, usage logging
  }
}
```

> **注意**：`AiGatewayClient.chat()` 非流式方法当前不存在，需新增。Sprint 3.1 的 Harness 同样依赖此接口。

#### 4.2.5 IPC Handler 扩展

**文件**：`src/main/ipc/handlers/memory.handler.ts`

**现状**：注册 6 个 v1 IPC 通道。

**改造方案**：
1. 保留所有 v1 handler 方法不变
2. 新增 v2 handler 方法（`handleListEntries`, `handleSearch`, `handleTriggerCheckpoint` 等）
3. 构造函数新增 v2 组件依赖注入
4. `IPC_CHANNELS` 中新增所有 v2 通道常量

#### 4.2.6 LocalRagEngine 保留

**文件**：`src/main/services/local-rag-engine.ts`

**不修改**。保留作为 `MemoryIndexer` 的降级后备。当 `MemoryIndexer` 不可用时（sqlite-vec 缺失、embedding 模型未加载），系统自动回退到 `LocalRagEngine`。

#### 4.2.7 共享类型扩展

**文件**：`src/shared/types.ts`

**策略**：v1 类型保留不删除（标记 `@deprecated`），新增 v2 类型使用独立命名。

| v1 类型（保留） | v2 类型（新增） |
|----------------|----------------|
| `MemorySnapshotResponse` | `MemoryV2StatsResponse`（totalTokens, entryCount, lastCheckpoint, sections） |
| `MemoryUpdateItem` | 不删除，但 v2 UI 使用新接口 |
| `DailyLogEntry` | 不删除，与 `LogEntry` 共存 |
| `RagSearchHit` | `MemorySearchResult`（id, section, content, confidence, score, source） |

#### 4.2.8 Renderer Store 新增

**文件**：`src/renderer/store/memoryStore.ts`（新建）

使用 Zustand，按需求 3.2.7 规格实现。不修改现有 `aiChatStore.ts`。

### 4.3 新增依赖与加载策略

#### 4.3.1 新增 npm 依赖

| 包名 | 用途 | 大小 | 风险 |
|------|------|------|------|
| `yaml` | YAML frontmatter 解析/序列化 | ~80KB | 低，纯 JS |
| `@xenova/transformers` | 本地 embedding 模型推理 | 模型 ~50MB | 中，首次加载慢 |
| `sqlite-vec`（或备选 `vectra`） | SQLite 向量搜索扩展 | native | 中，跨平台编译 |

#### 4.3.2 懒加载策略

`LocalEmbeddingProvider` 和 `sqlite-vec` **不在应用启动时初始化**：

```
应用启动 → MemoryFileManager.load()（仅解析 Markdown，无 embedding）
         ↓
首次搜索 or 首次检查点 → 触发 embedding 模型加载（后台）
                       → 触发 sqlite-vec 初始化
                       → 加载期间：搜索降级到 FTS5-only / LocalRagEngine
```

#### 4.3.3 降级矩阵

| 组件 | 不可用时 | 降级行为 |
|------|---------|---------|
| `@xenova/transformers` 未安装 / 模型下载失败 | `LocalEmbeddingProvider.isAvailable() === false` | 搜索降级到 FTS5-only（BM25），提取器仍可运行（用 LLM 做相似度判断） |
| `sqlite-vec` 编译失败 | `MemoryIndexer` 初始化失败 | 回退到 `LocalRagEngine`（JSON 索引 + BM25） |
| LLM API 不可用 | `MemoryExtractor.callExtractionLLM()` 失败 | 检查点跳过提取步骤，保留原始日志等待下次 |
| YAML 解析异常 | `MemoryFileManager.parseMarkdown()` 失败 | 以 v1 纯文本模式读取，标记待迁移 |

#### 4.3.4 打包配置

- `@xenova/transformers` 模型文件**不打包进 asar**，首次运行时下载到 `userData/models/`
- `sqlite-vec` native 扩展纳入 `electron-builder.yml` 的 `extraResources`
- 在 `package.json` 中将 `@xenova/transformers` 和 `sqlite-vec` 标记为 `optionalDependencies`

### 4.4 与 Sprint 3.1 的契约

Sprint 3.1 通过以下接口与本 Sprint 交互：

```typescript
// 由 Sprint 3.2 提供
interface MemoryManagerForHarness {
  appendHarnessTrace(event: HarnessTraceEvent): Promise<void>
  search(query: string, options?: SearchOptions): Promise<HybridSearchResult[]>
}
```

Sprint 3.1 的 Orchestrator、Guardrails、Sensors 通过依赖注入接收此接口。

### 4.5 与 Sprint 4 的契约（重要）

Sprint 4 重构后，其 ContextEngine v2 通过以下接口消费本 Sprint：

```typescript
// 由 Sprint 3.2 提供给 Sprint 4
interface MemoryIndexClient {
  searchRelevantMemory(query: string, limit: number): Promise<MemorySearchResult[]>
}
```

Sprint 4 的文档语义搜索与 Sprint 3.2 的记忆检索是**两个独立的索引**（一个云端、
一个本地），各有各的数据源，在 ContextEngine 层合并结果。

### 4.6 与 CLAUDE.md 的一致性

- **"文件即真相"**：MEMORY.md、ARCHIVE.md、CHANGELOG.md 都是 Markdown 文件，用户可读可编辑
- **"AI 建议，人类决策"**：所有自动提取的记忆都可被用户编辑、删除、锁定
- **"个人空间隔离"**：记忆文件在 `.sibylla/memory/` 下，遵循个人空间规则
- **"Git 不可见"**：记忆文件通过 `.gitignore` 排除（敏感信息）
- **"原子写入"**：MEMORY.md 写入使用 temp + rename
- **"TypeScript 严格 + 禁止 any"**：所有接口使用 discriminated union
- **命名规范**：kebab-case 文件名（`memory-extractor.ts`），camelCase store（`memoryStore.ts`）

---

## 五、目录结构

```
sibylla-desktop/src/main/services/memory/
├── memory-file-manager.ts           # MEMORY.md v2 读写与迁移
├── memory-extractor.ts              # LLM 驱动提取器
├── checkpoint-scheduler.ts          # 心跳检查点调度
├── memory-compressor.ts             # 压缩与归档
├── memory-indexer.ts                # 向量索引
├── hybrid-retriever.ts              # 混合检索
├── evolution-log.ts                 # 演化日志
├── embedding-provider.ts            # 本地/云端 embedding 抽象
├── log-store.ts                     # JSONL 日志存储（v2）
├── types.ts                         # 共享类型
└── index.ts                         # 统一导出

sibylla-desktop/src/main/services/
└── memory-manager.ts                # 现有 v1，扩展为 v2 门面

sibylla-desktop/src/main/ipc/handlers/
└── memory.ts                        # 新增 IPC 入口

sibylla-desktop/src/renderer/store/
└── memoryStore.ts                   # 新增 Zustand store

sibylla-desktop/src/renderer/components/memory/
├── MemoryPanel.tsx                  # 主面板
├── MemorySection.tsx                # 分节展示
├── MemoryEntryCard.tsx              # 单条记忆卡片
├── MemoryEntryEditor.tsx            # 编辑器
├── MemoryEntryHistory.tsx           # 演化历史
├── MemorySearchBar.tsx              # 混合检索
├── MemoryHeader.tsx                 # 头部状态条
└── CheckpointStatusIndicator.tsx    # 检查点状态

sibylla-desktop/tests/memory/
├── memory-file-manager.test.ts
├── memory-extractor.test.ts
├── checkpoint-scheduler.test.ts
├── memory-compressor.test.ts
├── memory-indexer.test.ts
├── hybrid-retriever.test.ts
└── evolution-log.test.ts

# Workspace 运行时目录
.sibylla/memory/
├── MEMORY.md                        # 精选记忆（v2 格式）
├── ARCHIVE.md                       # 归档记忆
├── CHANGELOG.md                     # 演化日志（当前月）
├── CHANGELOG-2026-03.md             # 演化日志（历史月）
├── checkpoints.jsonl                # 检查点记录
├── compressions.jsonl               # 压缩记录
├── snapshots/                       # 压缩前快照（24h 保留）
│   └── {timestamp}.md
├── logs/                            # 原始交互日志（按月分片）
│   ├── 2026-04.jsonl
│   └── 2026-03.jsonl
└── index/
    ├── memory.db                    # SQLite 主索引
    └── memory.db-wal                # WAL 文件
```

---

## 六、IPC 接口清单

```typescript
// sibylla-desktop/src/shared/types.ts (扩展)

// 记忆查询
'memory:listEntries': () => Promise<MemoryEntry[]>
'memory:listArchived': () => Promise<MemoryEntry[]>
'memory:search': (query: string, options?: SearchOptions) => Promise<HybridSearchResult[]>
'memory:getEntry': (id: string) => Promise<MemoryEntry | null>
'memory:getStats': () => Promise<{ totalTokens: number; entryCount: number; lastCheckpoint: string }>

// 记忆编辑
'memory:updateEntry': (id: string, content: string) => Promise<void>
'memory:deleteEntry': (id: string) => Promise<void>
'memory:lockEntry': (id: string, locked: boolean) => Promise<void>

// 检查点与压缩
'memory:triggerCheckpoint': () => Promise<CheckpointRecord>
'memory:triggerCompression': () => Promise<CompressionResult>
'memory:undoLastCompression': () => Promise<void>

// 演化日志
'memory:getEvolutionHistory': (entryId?: string) => Promise<EvolutionEvent[]>

// 索引管理
'memory:rebuildIndex': () => Promise<void>
'memory:getIndexHealth': () => Promise<{ healthy: boolean; entryCount: number }>

// 配置
'memory:getConfig': () => Promise<MemoryConfig>
'memory:updateConfig': (patch: Partial<MemoryConfig>) => Promise<void>

// Events (主进程 → 渲染进程)
'memory:checkpointStarted': (record: CheckpointRecord) => void
'memory:checkpointCompleted': (record: CheckpointRecord) => void
'memory:checkpointFailed': (record: CheckpointRecord) => void
'memory:compressionStarted': () => void
'memory:compressionCompleted': (result: CompressionResult) => void
'memory:entryAdded': (entry: MemoryEntry) => void
'memory:entryUpdated': (entry: MemoryEntry) => void
'memory:entryDeleted': (id: string) => void
```

---

## 七、验收检查清单

### 格式与迁移
- [ ] MEMORY.md v2 格式支持 6 个 section 与元数据
- [ ] v1 → v2 自动迁移（默认置信度 0.7）
- [ ] 外部编辑检测与重载
- [ ] 原子写入（temp + rename）

### 精选记忆提取
- [ ] 200 条日志批次提取 < 30 秒
- [ ] 置信度 < 0.5 自动丢弃
- [ ] 相似度 > 0.85 自动合并
- [ ] 提取失败 3 次重试
- [ ] 过度提取警告（> 20 条/批次）

### 心跳检查点
- [ ] 2 小时定时触发
- [ ] 50 次交互触发
- [ ] 手动触发
- [ ] 关键事件触发（Spec 大改、Guardrail 重复）
- [ ] 运行中的检查点队列管理
- [ ] 失败重试策略
- [ ] 不阻塞用户交互

### 演化日志
- [ ] 每次 MEMORY.md 变更追加记录
- [ ] 超 5000 条自动轮转月份文件
- [ ] 手动编辑被记录为 manual-edit
- [ ] 查询历史支持按条目、类型、时间过滤

### 压缩与归档
- [ ] 超 12K tokens 触发压缩
- [ ] 三阶段执行（discard → merge → archive）
- [ ] 目标 8K-12K 范围
- [ ] 24 小时压缩前快照
- [ ] 撤销压缩可用
- [ ] 锁定条目豁免压缩
- [ ] LLM 合并产出连贯内容

### 向量索引与检索
- [ ] 本地 embedding 可用
- [ ] 云端 embedding 可切换（需用户显式启用）
- [ ] 混合检索权重生效（0.6/0.3/0.1）
- [ ] 响应 < 200ms（10000 条以下）
- [ ] 索引损坏自动重建
- [ ] 归档内容可检索

### 记忆面板 UI
- [ ] 按 section 分组展示
- [ ] 置信度可视化
- [ ] 编辑、删除、锁定操作
- [ ] 混合检索搜索框
- [ ] 手动触发检查点按钮
- [ ] Token 使用状态显示
- [ ] 演化历史查看

### Trace 信号接入
- [ ] appendHarnessTrace 接口可用
- [ ] Guardrail 重复 5+ 次触发 key_event
- [ ] Trace 事件不阻塞 Harness
- [ ] 提取器识别 Trace 事件

### 集成
- [ ] `memory-manager.ts` 门面扩展完成
- [ ] `context-engine.ts` 改用 memory.search
- [ ] Sprint 3.1 的 Orchestrator 接入 Trace
- [ ] Sprint 4 的 ContextEngine v2 通过 MemoryIndexClient 消费

### 性能
- [ ] 提取 < 30 秒
- [ ] 检查点总耗时 < 60 秒
- [ ] 检索 < 200ms
- [ ] 索引更新 < 50ms/条
- [ ] MEMORY.md 加载 < 100ms
- [ ] 压缩 < 90 秒

### 安全
- [ ] 本地 embedding 默认不上传
- [ ] 云端 embedding 需显式启用
- [ ] 个人空间隔离生效
- [ ] 演化日志不可删除

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| LLM 提取过度，MEMORY.md 膨胀 | 高 | 中 | 置信度阈值 + 相似度合并 + 批次上限警告 + 压缩机制 |
| Claude Haiku 提取质量不足 | 中 | 中 | 低置信度自动丢弃；用户可切换更强模型；支持人工审核 |
| 本地 embedding 模型加载慢影响启动 | 中 | 低 | 懒加载（首次检索时初始化）；启动时后台预热 |
| SQLite + sqlite-vec 跨平台兼容问题 | 中 | 高 | 提供 vectra.js 作为备选；CI 多平台测试 |
| 向量索引与 MEMORY.md 不一致 | 中 | 中 | 定期一致性校验；提供"重建索引"入口；启动时健康检查 |
| 压缩合并丢失信息 | 中 | 高 | 压缩前快照 + 24 小时撤销窗口；LLM 合并提示词强调"保留所有独特信息" |
| 用户不理解置信度数值 | 中 | 低 | UI 用颜色/进度条可视化；Tooltip 解释；分级显示（高/中/低）|
| Trace 事件写入频率过高拖慢 Harness | 低 | 中 | 异步批量写入；超过阈值降级为采样 |
| 记忆面板让用户焦虑（"AI 记了我什么"）| 中 | 中 | 清晰的删除与锁定能力；隐私教育；默认某些类别不开启 |

---

## 九、参考资料

- [CLAUDE.md](../../../CLAUDE.md) - 项目宪法
- [memory-system-design.md](../../design/memory-system-design.md) - 记忆系统设计（需在本 Sprint 中追加 v2 章节）
- [sprint3-ai-mvp.md](./sprint3-ai-mvp.md) - 记忆系统 v1 来源
- [sprint3.1-harness-infrastructure.md](./sprint3.1-harness-infrastructure.md) - Harness 层（Trace 事件生产方）
- [sprint4-semantic-search.md](../phase2/sprint4-semantic-search.md) - 需根据本 Sprint 重构（移除 2.5/2.6/2.7）

---