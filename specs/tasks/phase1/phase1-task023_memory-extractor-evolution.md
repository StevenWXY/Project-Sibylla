# 精选记忆提取器与演化日志

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK023 |
| **任务标题** | 精选记忆提取器与演化日志 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现两个核心智能组件——LLM 驱动的精选记忆提取器（MemoryExtractor）和记忆演化日志（EvolutionLog）。提取器负责从原始日志中自动提取高价值结构化记忆，演化日志则记录每次 MEMORY.md 变更的完整追溯链。两者组合实现"AI 持续学习团队工作方式"的核心能力。

### 背景

TASK022 已建立 v2 数据基础（types.ts、MemoryFileManager、LogStore、MemoryManager 门面）。本任务在此基础上构建智能处理层的核心组件。提取器是整个 v2 系统的"大脑"——没有它，MEMORY.md 只是一个静态文件；有了它，MEMORY.md 能从交互日志中持续学习。演化日志是"可审计的证词"——没有它，用户无法理解 AI 为什么"记住了这些"；有了它，每次记忆变更都有原因可追溯。

### 范围

**包含：**
- `MemoryExtractor` — LLM 驱动的增量提取、置信度评估、去重合并、过度提取检测
- `EvolutionLog` — 变更记录追加、查询、轮转、格式化
- `MemoryManager.applyExtractionReport()` 实际实现 — 将提取报告应用到 MEMORY.md
- `MemoryManager.appendHarnessTrace()` 中 detectKeyEvents 逻辑
- 单元测试

**不包含：**
- CheckpointScheduler 调度逻辑（TASK024）
- MemoryCompressor 压缩逻辑（TASK024）
- MemoryIndexer 向量检索（TASK025）
- MemoryPanel UI（TASK026）

## 验收标准

### 精选记忆提取器

- [ ] 200 条日志批次提取 < 30 秒
- [ ] 置信度 < 0.5 的候选自动丢弃，记录在 ExtractionReport.discarded
- [ ] 相似度 > 0.85（同 section 内）的候选自动合并，而非新增
- [ ] 合并时更新 hits 计数、追加 sourceLogIds、重算 confidence 为加权平均
- [ ] 合并时若 existing.locked=true，跳过合并，保留原条目
- [ ] LLM 调用失败时重试 3 次（指数退避：1s、5s、30s），最终失败记录日志并保留原始日志
- [ ] 单批次新增 > 20 条时标记过度提取警告
- [ ] 提取完成后返回 ExtractionReport（added/merged/discarded 计数 + durationMs + tokenCost）
- [ ] 提取器运行不阻塞主线程（async queue 或 worker）

### 演化日志

- [ ] MEMORY.md 被 MemoryExtractor 修改后，自动追加演化日志条目
- [ ] 用户手动编辑 MEMORY.md 后，file watcher 检测并追加 manual-edit 类型条目
- [ ] 单文件超 5000 条时轮转为 `CHANGELOG-YYYY-MM.md`
- [ ] 演化日志 malformed 或 missing 时继续运行（记录 warning，重新生成 header）
- [ ] 查询支持按 entryId、type、since 过滤

### applyExtractionReport

- [ ] 新增条目写入 MemoryFileManager 并触发 EvolutionLog
- [ ] 合并条目更新 MemoryFileManager 并触发 EvolutionLog
- [ ] 丢弃条目仅记录在 EvolutionLog（不写入 MEMORY.md）

### detectKeyEvents

- [ ] Guardrail 同一规则 24h 内触发 5+ 次时，emit `guardrail-repeated` 事件
- [ ] 检测逻辑不阻塞 Harness 执行

## 依赖关系

### 前置依赖

- [x] TASK022（数据层）— types.ts、MemoryFileManager、LogStore、AiGatewaySession、MemoryManager 门面

### 被依赖任务

- TASK024（检查点与压缩）— CheckpointScheduler 调用 MemoryExtractor.extract()
- TASK025（向量检索）— MemoryIndexer 依赖 ExtractionReport 更新索引
- TASK026（记忆面板 UI）— UI 展示 EvolutionLog 历史、触发 manual-edit

## 参考文档

- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — 需求 3.2.2、3.2.4、3.2.8、4.2.1
- `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` — LLM 调用模式与重试策略

## 技术执行路径

### 架构设计

```
提取与演化流水线：

原始日志 (LogStore)
    │
    ▼
MemoryExtractor.extract(input)
    ├── Step 1: callExtractionLLM(logs + existingMemory) → candidates[]
    ├── Step 2: filterByConfidence(candidates) → highConfidence[]
    ├── Step 3: checkOverExtraction(highConfidence) → warn if > 20
    ├── Step 4: for each candidate:
    │   ├── findSimilar(candidate, existingMemory) → existing | null
    │   ├── if similar → mergeEntries(existing, candidate) → report.merged
    │   └── if not similar → candidateToEntry(candidate) → report.added
    └── Step 5: return ExtractionReport

applyExtractionReport(report)
    ├── for each added entry:
    │   ├── MemoryFileManager.save(updated snapshot)
    │   └── EvolutionLog.append({ type: 'add', ... })
    ├── for each merged entry:
    │   ├── MemoryFileManager.save(updated snapshot)
    │   └── EvolutionLog.append({ type: 'merge', ... })
    └── for each discarded:
        └── EvolutionLog.append({ type: 'discard', ... })  ← 仅日志，不写 MEMORY

演化日志写入路径：

.sibylla/memory/CHANGELOG.md        ← 当前活跃文件
.sibylla/memory/CHANGELOG-2026-04.md ← 轮转后的历史文件
```

### 步骤 1：完善 ExtractionInput/ExtractionCandidate/ExtractionReport 类型

**文件：** `src/main/services/memory/types.ts`（扩展 TASK022 定义的骨架）

1. 确认 `ExtractionInput` 接口完整：
   - `logs: LogEntry[]`
   - `existingMemory: MemoryEntry[]`
   - `workspaceContext: { name: string; description?: string }`
2. 确认 `ExtractionCandidate` 接口完整：
   - `section: MemorySection`
   - `content: string`
   - `confidence: number`
   - `reasoning: string`
   - `sourceLogIds: string[]`
   - `similarExistingId?: string`
3. 确认 `ExtractionReport` 接口完整：
   - `added: MemoryEntry[]`
   - `merged: Array<{ existing: string; merged: string }>`
   - `discarded: Array<{ candidate: string; reason: string }>`
   - `durationMs: number`
   - `tokenCost: { input: number; output: number }`
4. 定义 `ExtractorConfig` 接口：
   - `extractorModel: string`（默认 `'claude-haiku'`）
   - `confidenceThreshold: number`（默认 `0.5`）
   - `similarityThreshold: number`（默认 `0.85`）
   - `maxNewEntriesPerBatch: number`（默认 `20`）
   - `maxRetries: number`（默认 `3`）

### 步骤 2：完善 EvolutionEvent/EvolutionEventType 类型

**文件：** `src/main/services/memory/types.ts`（扩展 TASK022 定义的骨架）

1. 确认 `EvolutionEventType` 联合类型：`'add' | 'update' | 'merge' | 'archive' | 'delete' | 'manual-edit' | 'lock' | 'unlock'`
2. 确认 `EvolutionEvent` 接口完整：
   - `id: string`
   - `timestamp: string`
   - `type: EvolutionEventType`
   - `entryId: string`
   - `section: MemorySection`
   - `before?: Partial<MemoryEntry>`
   - `after?: Partial<MemoryEntry>`
   - `trigger: { source: 'checkpoint' | 'manual' | 'compression' | 'migration'; checkpointId?: string; userId?: string }`
   - `rationale?: string`

### 步骤 3：实现 MemoryExtractor

**文件：** `src/main/services/memory/memory-extractor.ts`

1. 构造函数注入：`aiGateway: AIGatewayClient`、`similarityIndex`（MemoryIndexer 接口，TASK025 提供；不可用时降级为文本相似度）、`config: ExtractorConfig`、`logger: Logger`
2. 定义 `SYSTEM_PROMPT` 常量（需求 3.2.2 中的完整 prompt）
3. 实现 `extract(input: ExtractionInput): Promise<ExtractionReport>`：
   - 初始化 `report` 对象
   - 记录 `startTime = Date.now()`
   - **Step 1**：调用 `callExtractionLLM(input)` → `candidates[]`
   - **Step 2**：过滤 confidence < threshold 的候选 → `report.discarded` 记录丢弃原因
   - **Step 3**：高置信度候选 > 20 时记录 `memory.extract.over_extraction_suspected` warning
   - **Step 4**：遍历高置信度候选：
     - 调用 `findSimilar(candidate, existingMemory)` 查找相似条目
     - 相似 → `mergeEntries(similar, candidate)` → `report.merged`
     - 不相似 → `candidateToEntry(candidate)` → `report.added`
   - 计算 `report.durationMs`
   - 返回 report
4. 实现 `callExtractionLLM(input)` 方法：
   - 调用 `aiGateway.createSession({ role: 'memory-extractor' })`
   - 构建 prompt（格式化日志摘要 + 现有记忆列表）
   - 调用 `session.chat({ model: config.extractorModel, messages: [...], responseFormat: 'json', temperature: 0.2 })`
   - 使用 `withRetry(fn, 3)` 包装
   - 解析 JSON 响应 → `candidates[]`
   - 在 `finally` 中 `session.close()`
5. 实现 `buildPrompt(input)` 方法：
   - 格式化日志条目为人类可读摘要（每条 ≤ 2 行）
   - 列出现有记忆条目（id + section + content 摘要）
   - 组装为 user message
6. 实现 `withRetry(fn, maxAttempts)` 通用重试方法：
   - 延迟数组 `[1000, 5000, 30000]`
   - 指数退避重试
   - 最后一次失败抛出错误
7. 实现 `findSimilar(candidate, existing)` 方法：
   - 优先使用 `similarityIndex`（如果已初始化）做向量相似度
   - 降级方案：使用文本 Jaccard 相似度或简单的关键词重叠度
   - 仅在同 section 内比较
   - 相似度 > 0.85 → 返回最相似的 existing entry
   - 否则返回 null
8. 实现 `cosineSimilarity(a, b)` 辅助方法
9. 实现 `mergeEntries(existing, candidate)` 方法：
   - 若 `existing.locked` → 记录 `memory.merge.skipped.locked`，返回 existing 不变
   - 新 confidence = `(existing.confidence × existing.hits + candidate.confidence) / (existing.hits + 1)`
   - 新 hits = `existing.hits + 1`
   - 新 sourceLogIds = 去重合并
   - 新 content = `candidate.confidence > existing.confidence + 0.15 ? candidate.content : existing.content`
   - 新 updatedAt = 当前时间
10. 实现 `candidateToEntry(candidate)` 方法：
    - 生成 ID：`${sectionPrefix}-${Date.now()}-${random}`
    - section 前缀映射：pref/dec/iss/conv/risk/glos
    - hits = 0、locked = false、tags = []
    - createdAt = updatedAt = 当前时间

### 步骤 4：实现文本相似度降级方案

**文件：** `src/main/services/memory/memory-extractor.ts`（内部方法）

当 MemoryIndexer 不可用时，MemoryExtractor 仍需去重能力。实现轻量文本相似度：

1. 实现 `textSimilarity(a: string, b: string): number` 方法：
   - 分词（按空格 + 中文字符分割）
   - 计算 Jaccard 系数：`|A∩B| / |A∪B|`
   - 返回 0-1 相似度
2. 在 `findSimilar()` 中使用降级链：
   - `if (this.similarityIndex?.isAvailable())` → 向量相似度
   - `else` → 文本相似度（阈值适当降低至 0.7，因为文本相似度精度较低）

### 步骤 5：实现 EvolutionLog

**文件：** `src/main/services/memory/evolution-log.ts`

1. 构造函数注入：`workspaceRoot: string`、`fileManager: FileManager`、`logger: Logger`
2. 定义 `MAX_ENTRIES_PER_FILE = 5000` 常量
3. 实现 `append(event: EvolutionEvent)` 方法：
   - 获取当前日志文件路径 `getCurrentLogPath()`
   - 检查当前文件条目数是否超限
   - 超限 → 轮转为 `CHANGELOG-YYYY-MM.md`，创建新的 `CHANGELOG.md`
   - 格式化事件为 Markdown `formatEvent(event)`
   - 追加写入文件
   - 写入失败记录 error 日志但不抛出（非阻塞）
4. 实现 `getCurrentLogPath()` 方法：
   - 检查 `.sibylla/memory/CHANGELOG.md` 是否存在
   - 不存在 → 创建并写入 header
   - 存在 → 统计条目数（`## ` 标题行数）
   - 超 5000 → 重命名为 `CHANGELOG-{当前月份}.md`，创建新的
   - 返回路径
5. 实现 `query(filter)` 方法：
   - `entryId?` — 过滤特定条目的演化历史
   - `type?` — 过滤特定变更类型
   - `since?` — 过滤指定时间之后的记录
   - `limit?` — 限制返回数量
   - 读取所有 CHANGELOG 文件（当前 + 历史轮转）
   - 解析 Markdown 格式的事件记录
   - 应用过滤条件
   - 按时间倒序返回
6. 实现 `formatEvent(event)` 方法：
   - 输出 Markdown 格式的可读事件记录
   - 包含：时间戳、类型、条目 ID、section、触发者、rationale
   - before/after 以 JSON 代码块展示
   - 分隔线 `---` 结尾
7. 实现 `parseEvent(line)` 辅助方法：
   - 解析 Markdown 格式的事件行
   - malformed 行记录 warning 并跳过
8. 实现 `countEntries(filePath)` 辅助方法：
   - 统计文件中 `## ` 标题行数
   - 用于轮转判断

### 步骤 6：实现 applyExtractionReport

**文件：** `src/main/services/memory-manager.ts`（填充 TASK022 的空壳）

1. 实现 `applyExtractionReport(report: ExtractionReport)` 方法：
   - 调用 `this.v2Components?.fileManager.load()` 获取当前 snapshot
   - 遍历 `report.added`：
     - 将新条目追加到 `snapshot.entries`
     - 调用 `this.v2Components?.evolutionLog.append({ type: 'add', entryId, after, trigger: { source: 'checkpoint', checkpointId } })`
   - 遍历 `report.merged`：
     - 在 `snapshot.entries` 中找到原条目并替换
     - 调用 `this.v2Components?.evolutionLog.append({ type: 'merge', entryId, before, after, trigger: { source: 'checkpoint', checkpointId } })`
   - 遍历 `report.discarded`：
     - 仅调用 `this.v2Components?.evolutionLog.append({ type: 'delete', rationale: reason })` — 不修改 MEMORY.md
   - 更新 `snapshot.metadata.totalTokens`、`entryCount`、`lastCheckpoint`
   - 调用 `this.v2Components?.fileManager.save(snapshot)`
   - 检查 totalTokens 是否超过 12000 → 若是，标记需触发压缩（返回标志或 emit 事件）

### 步骤 7：实现 detectKeyEvents

**文件：** `src/main/services/memory-manager.ts`（填充 TASK022 的空壳）

1. 实现 `detectKeyEvents(event: HarnessTraceEvent)` 私有方法：
   - 仅处理 `guardrail_triggered` 类型
   - 提取 `event.details.ruleId`
   - 调用 `this.v2Components?.logStore.countByFilter({ type: 'harness_trace', traceType: 'guardrail_triggered', since: 24h前, details: { ruleId } })`
   - 若 count >= 5 → `this.eventBus?.emit('guardrail-repeated', { ruleId, count })`
2. 在 `appendHarnessTrace()` 中调用 `detectKeyEvents()`

### 步骤 8：编写单元测试

**文件：** `tests/memory/memory-extractor.test.ts`

1. 测试 LLM 提取流程：
   - mock AiGatewayClient.createSession() 返回预设 candidates
   - 验证 extract() 返回正确的 ExtractionReport
2. 测试置信度过滤：
   - confidence=0.4 的候选被丢弃
   - confidence=0.6 的候选被保留
3. 测试相似度合并：
   - mock similarityIndex 返回高相似度
   - 验证合并后的 confidence 是加权平均
   - 验证 sourceLogIds 去重合并
4. 测试 locked 条目跳过合并
5. 测试过度提取警告（> 20 条）
6. 测试 LLM 失败重试：
   - mock 前两次失败、第三次成功
   - 验证重试次数和最终成功
7. 测试文本相似度降级：
   - similarityIndex 不可用时使用文本相似度

**文件：** `tests/memory/evolution-log.test.ts`

1. 测试 append 正确写入 CHANGELOG.md
2. 测试 append 格式化为可读 Markdown
3. 测试超 5000 条轮转
4. 测试 query 按 entryId/type/since 过滤
5. 测试 malformed CHANGELOG 文件继续运行
6. 测试写入失败不抛异常

**文件：** `tests/memory/apply-report.test.ts`

1. 测试 applyExtractionReport 正确更新 snapshot
2. 测试新增条目触发 EvolutionLog type='add'
3. 测试合并条目触发 EvolutionLog type='merge'
4. 测试丢弃条目仅触发 EvolutionLog type='delete'
5. 测试 totalTokens 超过阈值时标记压缩

### 步骤 9：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 手动验证提取链路：
   - 准备一组测试日志（JSONL 格式）
   - 配置 AI Gateway mock 返回预设候选
   - 调用 MemoryExtractor.extract()
   - 确认 ExtractionReport 正确
   - 调用 applyExtractionReport()
   - 确认 MEMORY.md 更新、CHANGELOG.md 记录正确

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
