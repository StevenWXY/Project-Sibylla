# 心跳检查点与压缩归档

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK024 |
| **任务标题** | 心跳检查点与压缩归档 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现记忆系统的自动化运维层——心跳检查点调度器（CheckpointScheduler）驱动定期记忆更新，记忆压缩器（MemoryCompressor）控制 MEMORY.md token 预算，以及 Trace 信号接入的完整集成。三者共同确保记忆系统"持续演化、不无限膨胀、可被 Harness 消费"。

### 背景

TASK022 建立了数据基础，TASK023 实现了提取器和演化日志。本任务将两者串联为自动化流水线：CheckpointScheduler 定期触发 → MemoryExtractor 提取 → applyExtractionReport 应用 → EvolutionLog 记录 → MemoryCompressor 在 token 超限时压缩。同时完成 Sprint 3.1 的 Trace 信号接入契约。

### 范围

**包含：**
- `CheckpointScheduler` — 四类触发条件、运行队列、失败重试、优雅中断
- `MemoryCompressor` — 三阶段压缩（淘汰→合并→归档）、快照与撤销、LLM 合并
- `appendHarnessTrace()` 完整实现 — Trace 事件写入 + detectKeyEvents（TASK023 已实现 detectKeyEvents 逻辑，本任务补充事件监听与 CheckpointScheduler 集成）
- `MemoryManager.compress()` 实际实现
- `MemoryManager.getAllArchivedEntries()` 实际实现 — ARCHIVE.md 读写
- `CheckpointRecord`、`CompressionResult` 完整类型与持久化
- 检查点记录与压缩记录的 JSONL 持久化
- 单元测试

**不包含：**
- MemoryIndexer 向量索引更新（TASK025 负责在 indexReport 中实现）
- MemoryPanel UI（TASK026）

## 验收标准

### 心跳检查点

- [ ] 距上次检查点 > 2 小时且有 ≥ 1 条日志时触发定时检查点
- [ ] 用户交互 ≥ 50 次时触发交互计数检查点（覆盖定时条件）
- [ ] 用户通过 UI 手动触发时立即执行
- [ ] 关键事件（Spec 大改、Guardrail 同规则 5+ 次触发）触发优先检查点
- [ ] 检查点运行中，后续触发进入队列（最大深度 3，超出丢弃并记录 warning）
- [ ] 检查点失败重试 3 次（指数退避 1s、5s、30s），最终失败记录日志 + UI 通知
- [ ] 检查点运行不阻塞用户交互（async queue）
- [ ] 应用关闭时优雅中止运行中的检查点（保存进度，下次启动可恢复）
- [ ] 检查点完成后记录摘要："Checkpoint completed: 3 added, 2 merged, 5 discarded (12.3s)"
- [ ] 检查点记录持久化到 `.sibylla/memory/checkpoints.jsonl`

### 记忆压缩

- [ ] MEMORY.md totalTokens > 12000 时触发压缩
- [ ] 三阶段按序执行：淘汰 → 合并 → 归档
- [ ] 每阶段完成后检查 totalTokens，≤ 10000 时跳过下一阶段
- [ ] 压缩到 ≤ 8000 tokens 时停止（目标 8K-12K 范围）
- [ ] 压缩前创建 24 小时快照于 `.sibylla/memory/snapshots/{timestamp}.md`
- [ ] 用户 24 小时内可撤销压缩（从快照恢复）
- [ ] LLM 合并产出连贯的综合条目
- [ ] 锁定条目（locked=true）豁免所有压缩阶段
- [ ] 归档条目移至 ARCHIVE.md，仍保留在向量索引中
- [ ] 压缩记录持久化到 `.sibylla/memory/compressions.jsonl`

### Trace 信号接入

- [ ] `appendHarnessTrace(event)` 将 Trace 事件写入 LogStore
- [ ] Guardrail 同规则 24h 内 5+ 次触发 `guardrail-repeated` 事件
- [ ] `guardrail-repeated` 事件被 CheckpointScheduler 监听，触发 key_event 检查点
- [ ] Trace 事件写入失败不阻塞 Harness 执行

## 依赖关系

### 前置依赖

- [x] TASK022（数据层）— types.ts、MemoryFileManager、LogStore、MemoryManager 门面
- [x] TASK023（提取器与演化日志）— MemoryExtractor、EvolutionLog、applyExtractionReport

### 被依赖任务

- TASK025（向量检索）— CheckpointScheduler.run() 中调用 indexer.indexReport()
- TASK026（记忆面板 UI）— UI 触发手动检查点、展示检查点/压缩状态

## 参考文档

- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — 需求 3.2.3、3.2.5、3.2.8、4.2.1
- [`specs/requirements/phase1/sprint3.1-harness-infrastructure.md`](../../requirements/phase1/sprint3.1-harness-infrastructure.md) — Harness Trace 事件生产方
- `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` — LLM 重试策略

## 技术执行路径

### 架构设计

```
检查点调度与压缩流水线：

EventBus 事件
├── 'user-interaction'          → 交互计数器递增
├── 'spec-file-major-edit'      → maybeRun('key_event')
├── 'guardrail-repeated'        → maybeRun('key_event')
└── 'memory:manual-checkpoint'  → maybeRun('manual')

CheckpointScheduler.maybeRun(trigger)
├── timer: 检查距上次 > 2h
├── interaction_count: 检查 ≥ 50 次
├── queue: isRunning → 入队(≤3) or 丢弃
└── run(trigger):
    ├── getLogsSince(lastCheckpoint) → logs
    ├── extractor.extract({ logs, existingMemory }) → report
    ├── applyExtractionReport(report)
    ├── indexer.indexReport(report) ← TASK025 实现
    ├── evolutionLog.append(...)
    ├── 更新 lastCheckpoint、interactionCount
    ├── 检查 totalTokens > 12000 → 触发压缩
    └── 记录 checkpoints.jsonl

MemoryCompressor.compress()
├── createSnapshot() → .sibylla/memory/snapshots/{ts}.md
├── Stage 1: shouldDiscard(entry) → confidence < 0.5 && hits == 0 && age > 30d
│   └── locked 条目豁免
├── Stage 2: mergeSimilar(entries) → similarity > 0.8
│   └── llmMerge(cluster) → LLM 重新措辞
├── Stage 3: archiveStale(entries) → hits == 0 && age > 90d
│   └── 移至 ARCHIVE.md，保留索引
└── finalize(entries, result) → save + log + clean old snapshots

压缩撤销：
undoLastCompression()
└── 读取最近 snapshot → MemoryFileManager.save(snapshot) → EvolutionLog.append({ type: 'manual-edit' })
```

### 步骤 1：完善 CheckpointRecord / CompressionResult 类型

**文件：** `src/main/services/memory/types.ts`（扩展 TASK022 的骨架）

1. 完善 `CheckpointTrigger` 联合类型：`'timer' | 'interaction_count' | 'manual' | 'key_event'`
2. 完善 `CheckpointRecord` 接口：
   - `id: string`
   - `trigger: CheckpointTrigger`
   - `startedAt: string`
   - `completedAt?: string`
   - `status: 'running' | 'success' | 'failed' | 'aborted'`
   - `report?: ExtractionReport`
   - `errorMessage?: string`
3. 完善 `CompressionResult` 接口：
   - `discarded: MemoryEntry[]`
   - `merged: Array<{ original: MemoryEntry[]; merged: MemoryEntry }>`
   - `archived: MemoryEntry[]`
   - `beforeTokens: number`
   - `afterTokens: number`
   - `snapshotPath: string`
4. 新增 `MemoryConfig` 接口：
   - `checkpointIntervalMs: number`（默认 `7200000` = 2h）
   - `interactionThreshold: number`（默认 `50`）
   - `extractorModel: string`（默认 `'claude-haiku'`）
   - `compressionThreshold: number`（默认 `12000`）
   - `compressionTargetMin: number`（默认 `8000`）
   - `compressionTargetMax: number`（默认 `12000`）
   - `searchWeights: { vector: number; bm25: number; timeDecay: number }`（默认 `{0.6, 0.3, 0.1}`）
   - `embeddingProvider: 'local' | 'cloud'`（默认 `'local'`）

### 步骤 2：实现 CheckpointScheduler

**文件：** `src/main/services/memory/checkpoint-scheduler.ts`

1. 构造函数注入：`memoryManager`、`extractor`、`indexer`（可选，TASK025 填充）、`evolutionLog`、`compressor`（可选，步骤 3 实现）、`eventBus`、`config`、`logger`
2. 维护内部状态：
   - `lastCheckpoint: Date = new Date(0)`
   - `interactionCount: number = 0`
   - `isRunning: boolean = false`
   - `queue: CheckpointTrigger[] = []`
   - `MAX_QUEUE = 3`
   - `currentRecord?: CheckpointRecord`（用于优雅中止）
3. 实现 `start()` 方法：
   - 启动定时器：`setInterval(() => this.maybeRun('timer'), 60 * 1000)` 每分钟检查
   - 监听 `user-interaction` 事件：递增计数，≥ 50 时 maybeRun
   - 监听 `spec-file-major-edit` 事件：maybeRun('key_event')
   - 监听 `guardrail-repeated` 事件：maybeRun('key_event')
   - 监听 `memory:manual-checkpoint` 事件：maybeRun('manual')
4. 实现 `stop()` 方法：
   - 清除定时器
   - 移除所有事件监听
   - 若 isRunning → 设置 abort 标志，等待当前 run 完成
5. 实现 `maybeRun(trigger)` 方法：
   - timer 触发：检查距上次检查点是否 > config.checkpointIntervalMs
   - interaction_count 触发：直接允许（已由计数器前置检查）
   - manual / key_event 触发：直接允许
   - 若 isRunning → 尝试入队（queue.length < MAX_QUEUE），否则丢弃 + 记录 warning
   - 若非 running → 调用 `run(trigger)`
   - run 完成后处理队列中的下一个 trigger
6. 实现 `run(trigger)` 方法：
   - 设置 isRunning = true
   - 创建 CheckpointRecord
   - emit `memory:checkpoint-started` 事件
   - 获取增量日志：`memoryManager.getLogsSince(lastCheckpoint)`
   - 若无日志 → 标记成功，直接返回
   - 获取现有记忆：`memoryManager.getAllEntries()`
   - 使用 `withRetry()` 调用 `extractor.extract()`
   - 应用提取报告：`memoryManager.applyExtractionReport(report)`
   - 更新索引：`indexer?.indexReport(report)`（如果 indexer 存在）
   - 记录演化日志：`evolutionLog.append({ checkpointId, trigger, report })`
   - 更新 lastCheckpoint、重置 interactionCount
   - 检查 totalTokens > compressionThreshold → 调用 `compressor?.compress()`
   - 持久化检查点记录到 `checkpoints.jsonl`
   - 标记成功/失败，emit 对应事件
   - finally：isRunning = false
7. 实现 `withRetry(fn, maxAttempts)` 方法：
   - 延迟数组 `[1000, 5000, 30000]`
   - 最多 3 次尝试
   - 全部失败 → 抛出错误（run 方法 catch 中记录失败 + emit 事件）
8. 实现 `generateId()` 辅助方法：`chk-${Date.now()}-${randomHex(4)}`
9. 实现 `abortCurrentRun()` 方法：
   - 设置 abort 标志
   - extractor 的 LLM 调用不可中断（等待自然完成或超时）
   - 检查点记录标记为 'aborted'

### 步骤 3：实现 MemoryCompressor

**文件：** `src/main/services/memory/memory-compressor.ts`

1. 构造函数注入：`memoryManager`、`aiGateway`、`indexer`（可选）、`evolutionLog`、`fileManager`、`config`、`logger`
2. 定义内部常量：
   - `TARGET_MIN = config.compressionTargetMin`（默认 8000）
   - `TARGET_MAX = config.compressionTargetMax`（默认 12000）
   - `TRIGGER_THRESHOLD = config.compressionThreshold`（默认 12000）
3. 实现 `compress()` 方法：
   - 调用 `createSnapshot()` 保存压缩前快照
   - 获取所有条目：`memoryManager.getAllEntries()`
   - 估算当前 totalTokens：`estimateTokens(entries)`
   - **Stage 1 — 淘汰**：
     - `partition(entries, shouldDiscard)` → kept + discarded
     - 记录 `result.discarded = discarded`
   - 检查 tokens ≤ TARGET_MAX → 跳到 finalize
   - **Stage 2 — 合并**：
     - `mergeSimilar(kept)` → merged entries + merges list
   - 检查 tokens ≤ TARGET_MAX → 跳到 finalize
   - **Stage 3 — 归档**：
     - `archiveStale(kept)` → active + archived
   - 调用 `finalize(entries, result)`
4. 实现 `shouldDiscard(entry)` 方法：
   - `entry.locked` → false（豁免）
   - `entry.confidence < 0.5` && `entry.hits === 0` && `ageInDays(entry.createdAt) > 30` → true
5. 实现 `mergeSimilar(entries)` 方法：
   - 调用 `clusterBySimilarity(entries, 0.8)`
   - 相似度检测优先使用 indexer（向量相似度），降级为文本相似度
   - 对每个 cluster：
     - cluster 中有 locked 条目 → 跳过合并，保留原样
     - cluster 长度 = 1 → 保留
     - cluster 长度 > 1 → 调用 `llmMerge(cluster)`
   - 返回 `{ entries: result[], merges } `
6. 实现 `llmMerge(cluster)` 方法：
   - 调用 `aiGateway.createSession({ role: 'memory-compressor' })`
   - 构建 prompt：列出 cluster 中所有条目内容，要求合并为一条连贯的综合条目
   - system prompt 强调"保留所有独特信息，消除重复"
   - 调用 `session.chat({ model: 'claude-haiku', messages: [...] })`
   - 构建合并后的 MemoryEntry：
     - ID: `merged-{Date.now()}`
     - section: cluster[0].section
     - content: LLM 响应
     - confidence: 加权平均 `Σ(conf×hits) / Σhits`
     - hits: `Σhits`
     - createdAt: 最早条目的 createdAt
     - updatedAt: 当前时间
     - sourceLogIds: 去重合并
     - locked: false
     - tags: 去重合并
   - `session.close()`
7. 实现 `archiveStale(entries)` 方法：
   - 过滤 `hits === 0` && `ageInDays(createdAt) > 90` && `!locked`
   - 将过滤出的条目写入 ARCHIVE.md（追加格式）
   - 返回 `{ active: remaining, archived }`
8. 实现 `createSnapshot()` 方法：
   - 读取当前 MEMORY.md 内容
   - 生成路径 `.sibylla/memory/snapshots/{Date.now()}.md`
   - 写入快照文件
   - 返回快照路径
9. 实现 `finalize(entries, result)` 方法：
   - 构建 MemoryFileSnapshot 并保存
   - 为每个淘汰/合并/归档操作写入 EvolutionLog
   - 记录压缩结果到 `compressions.jsonl`
   - 清理超过 24 小时的旧快照
   - 返回 CompressionResult
10. 实现 `estimateTokens(entries)` 方法：
    - 汇总所有条目 content 的 token 估算
11. 实现 `ageInDays(createdAt)` 辅助方法
12. 实现 `clusterBySimilarity(entries, threshold)` 方法：
    - 使用 indexer 做向量相似度（如果可用）
    - 降级为文本 Jaccard 相似度
    - 返回 clusters: `MemoryEntry[][]`
13. 实现 `undoLastCompression()` 方法：
    - 查找 `.sibylla/memory/snapshots/` 下最新的快照
    - 检查快照是否在 24 小时内
    - 读取快照内容 → MemoryFileManager.load() → save()
    - 写入 EvolutionLog `{ type: 'manual-edit', rationale: 'undo compression' }`
    - 超过 24 小时 → 抛出错误

### 步骤 4：实现 ARCHIVE.md 读写

**文件：** `src/main/services/memory/memory-file-manager.ts`（扩展）

1. 实现 `archivePath()` → `.sibylla/memory/ARCHIVE.md`
2. 实现 `loadArchive()` 方法：
   - 读取 ARCHIVE.md
   - 解析格式（与 MEMORY.md 相同的 v2 格式，但所有条目均标记为 archived）
   - 返回 `MemoryEntry[]`
3. 实现 `saveArchive(entries)` 方法：
   - 序列化为 Markdown 格式
   - 原子写入
4. 实现 `appendToArchive(newEntries)` 方法：
   - 加载现有归档
   - 追加新条目
   - 保存

### 步骤 5：填充 MemoryManager 压缩与归档方法

**文件：** `src/main/services/memory-manager.ts`（填充 TASK022 的空壳）

1. 实现 `compress()` 方法：
   - `if (this.v2Components?.compressor)` → `compressor.compress()`
   - 否则返回 null 或抛 "v2 not available"
2. 实现 `getAllArchivedEntries()` 方法：
   - `if (this.v2Components?.fileManager)` → `fileManager.loadArchive()`
   - 否则返回空数组

### 步骤 6：实现检查点/压缩记录持久化

**文件：** `src/main/services/memory/checkpoint-scheduler.ts` + `memory-compressor.ts`

1. 检查点记录写入 `checkpoints.jsonl`：
   - 每次 run() 完成（成功/失败/中止）后追加一行 JSON
   - 格式：`JSON.stringify(checkpointRecord) + '\n'`
2. 压缩记录写入 `compressions.jsonl`：
   - 每次 compress() 完成后追加一行 JSON
   - 格式：`JSON.stringify({ timestamp, beforeTokens, afterTokens, discarded, merged, archived }) + '\n'`

### 步骤 7：完成 Trace 信号接入集成

**文件：** `src/main/services/memory-manager.ts` + `checkpoint-scheduler.ts`

1. 确认 `appendHarnessTrace()` 已在 TASK022/023 中实现（写入 LogStore + detectKeyEvents）
2. 在 CheckpointScheduler.start() 中添加对 `guardrail-repeated` 事件的监听
3. 确保 EventBus 事件正确传递：
   - `detectKeyEvents()` emit `guardrail-repeated` → CheckpointScheduler 监听 → maybeRun('key_event')
4. 补充 `spec-file-major-edit` 事件的发射源（在 FileManager 或 GitAbstraction 中检测 Spec 文件大幅修改）

### 步骤 8：编写单元测试

**文件：** `tests/memory/checkpoint-scheduler.test.ts`

1. 测试定时触发：mock 时间流逝 > 2h，验证 maybeRun 被调用
2. 测试交互计数触发：mock 50 次交互，验证 maybeRun 被调用
3. 测试手动触发：验证立即执行
4. 测试关键事件触发：验证 guardrail-repeated 事件触发 key_event
5. 测试队列管理：isRunning 时后续触发入队，队列满时丢弃
6. 测试失败重试：mock extractor 失败 2 次后成功
7. 测试最终失败：mock 3 次全部失败，验证错误记录和事件发射
8. 测试无日志跳过：getLogsSince 返回空数组 → 成功但无操作
9. 测试 graceful abort：设置 abort 标志后记录状态为 'aborted'
10. 测试 checkpoints.jsonl 持久化

**文件：** `tests/memory/memory-compressor.test.ts`

1. 测试三阶段压缩按序执行
2. 测试淘汰阶段：confidence < 0.5 + hits = 0 + age > 30d
3. 测试淘汰豁免：locked 条目不被淘汰
4. 测试合并阶段：相似度 > 0.8 的条目被合并
5. 测试 LLM 合并调用和结果格式
6. 测试归档阶段：hits = 0 + age > 90d 的条目归档
7. 测试 token 阈值检查：每阶段后检查是否需要继续
8. 测试快照创建与 24 小时撤销窗口
9. 测试 undoLastCompression 成功恢复
10. 测试 undoLastCompression 超过 24 小时拒绝
11. 测试 compressions.jsonl 持久化

### 步骤 9：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 手动验证完整检查点流水线：
   - 准备测试日志
   - 触发手动检查点
   - 确认提取 → 应用 → 演化日志 → 检查点记录 完整链路
5. 手动验证压缩流水线：
   - 构造 > 12K tokens 的 MEMORY.md
   - 触发压缩
   - 确认三阶段执行 → 快照创建 → 结果持久化
   - 验证撤销恢复功能

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
