# PHASE1-TASK024: 心跳检查点与压缩归档 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task024_checkpoint-compression.md](../specs/tasks/phase1/phase1-task024_checkpoint-compression.md)
> 创建日期：2026-04-20
> 最后更新：2026-04-20

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK024 |
| **任务标题** | 心跳检查点与压缩归档 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK022 + TASK023 |

### 1.1 目标

实现记忆系统的自动化运维层——CheckpointScheduler 驱动定期记忆更新，MemoryCompressor 控制 MEMORY.md token 预算，以及 Trace 信号接入的完整集成。三者共同确保记忆系统"持续演化、不无限膨胀、可被 Harness 消费"。

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| 类型扩展 | `memory/types.ts` | 完善 CheckpointTrigger/Record/CompressionResult/MemoryConfig |
| 检查点调度器 | `memory/checkpoint-scheduler.ts` | 新建：四类触发、运行队列、失败重试、优雅中断、JSONL 持久化 |
| 记忆压缩器 | `memory/memory-compressor.ts` | 新建：三阶段压缩、LLM 合并、快照撤销、JSONL 持久化 |
| 归档读写 | `memory/memory-file-manager.ts` | 扩展：ARCHIVE.md load/save/append |
| 管理器填充 | `memory-manager.ts` | 实现 compress()、getAllArchivedEntries()、V2Components 扩展 |
| 事件总线扩展 | `memory/memory-event-bus.ts` | 扩展：checkpoint/compression 事件 |
| 桶导出更新 | `memory/index.ts` | 新增导出 |
| 单元测试 | `tests/memory/checkpoint-scheduler.test.ts` | 调度器 10 组测试 |
| 单元测试 | `tests/memory/memory-compressor.test.ts` | 压缩器 11 组测试 |

### 1.3 范围边界

**包含：** CheckpointScheduler、MemoryCompressor、ARCHIVE.md 读写、MemoryManager 压缩/归档方法填充、Trace 信号接入集成、MemoryEventBus 扩展、单元测试

**不包含：** MemoryIndexer 向量索引更新（TASK025）、MemoryPanel UI（TASK026）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；记忆即演化、日志 append-only；原子写入先写临时文件再替换 | 全局约束 |
| `specs/design/architecture.md` | invoke/handle IPC 模式；主进程与渲染进程严格隔离 | 组件运行在主进程 |
| `specs/design/memory-system-design.md` | 三层存储架构；MEMORY.md 8-12K tokens；心跳检查点 2h/50 次；压缩策略 | 架构参考 |
| `specs/requirements/phase1/sprint3.2-memory.md` | 需求 3.2.3 检查点；需求 3.2.5 压缩；需求 3.2.8 Trace 信号接入；可观测性 checkpoints.jsonl/compressions.jsonl | 验收标准与接口签名 |
| `specs/tasks/phase1/phase1-task024_checkpoint-compression.md` | 9 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `llm-streaming-integration` | AiGatewaySession 非流式 chat() 调用；重试策略指数退避；Token 预算与 usage 统计 | MemoryCompressor.llmMerge() + CheckpointScheduler.withRetry() |
| `ai-context-engine` | MEMORY.md 作为 Layer 1 始终加载；压缩后对上下文组装的影响 | compress() 后 totalTokens 降低对上下文预算影响 |
| `typescript-strict-mode` | 联合类型 discriminated union；泛型 withRetry；类型守卫 | 全部类型定义与方法签名 |
| `sqlite-local-storage` | TASK025 向量索引接口预留；indexer?.indexReport() 可选调用 | CheckpointScheduler 中 indexer 可选注入 |

### 2.3 前置代码依赖（TASK022/023 产物）

| 模块 | 文件 | 状态 | 复用方式 |
|------|------|------|---------|
| `MemorySection` | `memory/types.ts:3-9` | 已定义 | 压缩器 section 判断 |
| `MemoryEntry` | `memory/types.ts:11-22` | 已定义 | 压缩/归档操作目标 |
| `MemoryFileSnapshot` | `memory/types.ts:31-34` | 已定义 | compress 后 snapshot 写入 |
| `ExtractionReport` | `memory/types.ts:105-111` | 已定义 | CheckpointScheduler.run() 中 extractor.extract() 返回值 |
| `EvolutionEvent` | `memory/types.ts:180-194` | 已定义 | 压缩各阶段演化日志记录 |
| `SimilarityIndexProvider` | `memory/types.ts:138-142` | 已定义 | MemoryCompressor.clusterBySimilarity() 降级链 |
| `CheckpointTrigger` | `memory/types.ts:146-150` | 骨架需重写 | 从 discriminated union 简化为字符串联合类型 |
| `CheckpointRecord` | `memory/types.ts:152-158` | 骨架需重写 | 扩展 status/trigger/report/errorMessage 字段 |
| `CompressionResult` | `memory/types.ts:160-166` | 骨架需重写 | 扩展为完整结构含 discarded/merged/archived 数组 |
| `MemoryFileManager` | `memory/memory-file-manager.ts` | 532 行 | load()/save() 原子读写 + 新增 archivePath/loadArchive/saveArchive/appendToArchive |
| `LogStore` | `memory/log-store.ts` | 148 行 | getSince() 用于 CheckpointScheduler 获取增量日志 |
| `MemoryExtractor` | `memory/memory-extractor.ts` | 330 行 | extract() 被 CheckpointScheduler.run() 调用 |
| `EvolutionLog` | `memory/evolution-log.ts` | 298 行 | append() 记录压缩/归档演化事件 |
| `AiGatewayClient` | `ai-gateway-client.ts` | 201 行 | createSession({ role: 'memory-compressor' }) |
| `MemoryManager` | `memory-manager.ts` | 791 行 | compress()/getAllArchivedEntries() 空壳待填充 |
| `V2Components` | `memory-manager.ts:73-77` | 需扩展 | 新增 compressor/scheduler 可选字段 |
| `MemoryEventBus` | `memory/memory-event-bus.ts` | 7 行 | 需扩展 checkpoint/compression 事件方法 |
| `MEMORY_MAX_TOKENS` | `memory-manager.ts:71` | 常量 12000 | 压缩触发阈值 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK025（向量检索） | CheckpointScheduler.run() 中调用 indexer.indexReport()；MemoryCompressor.clusterBySimilarity() 使用向量相似度 |
| TASK026（记忆面板 UI） | UI 触发手动检查点；展示检查点/压缩状态；undoLastCompression 按钮 |

### 2.5 npm 依赖

| 包 | 用途 | 风险 |
|----|------|------|
| `yaml` ^2.x | YAML frontmatter 解析（已由 TASK022 引入） | 无新增 |

---

## 三、现有代码盘点与差距分析

### 3.1 types.ts 骨架 vs 规范定义

```typescript
// 现有骨架（types.ts:146-166）
CheckpointTrigger → discriminated union { type: 'timer' } | { type: 'interaction_count'; count: number } | ...
// 规范要求：简单字符串联合 'timer' | 'interaction_count' | 'manual' | 'key_event'
// 决策：重写为字符串联合类型，更简洁，与规范 sprint3.2-memory.md 一致

CheckpointRecord → { id, trigger, timestamp, status: 'completed'|'failed', entryCount }
// 规范要求：{ id, trigger, startedAt, completedAt?, status: 'running'|'success'|'failed'|'aborted', report?, errorMessage? }
// 差距：缺 startedAt/completedAt/report/errorMessage；status 枚举不完整

CompressionResult → { discarded: number, merged: number, archived: number, beforeTokens, afterTokens }
// 规范要求：{ discarded: MemoryEntry[], merged: Array<{original: MemoryEntry[]; merged: MemoryEntry}>, archived: MemoryEntry[], beforeTokens, afterTokens, snapshotPath }
// 差距：discarded/merged/archived 应为完整对象数组而非计数；缺 snapshotPath

MemoryConfig → 不存在
// 规范要求：checkpointIntervalMs, interactionThreshold, extractorModel, compressionThreshold, compressionTargetMin/Max, searchWeights, embeddingProvider
```

### 3.2 MemoryFileManager 缺失归档方法

现有 `MemoryFileManager` 仅处理 `MEMORY.md`，无 ARCHIVE.md 相关方法：

| 缺失方法 | 说明 |
|---------|------|
| `archivePath()` | 返回 `.sibylla/memory/ARCHIVE.md` 路径 |
| `loadArchive()` | 读取并解析 ARCHIVE.md（v2 格式，所有条目标记 archived） |
| `saveArchive(entries)` | 序列化并原子写入 ARCHIVE.md |
| `appendToArchive(newEntries)` | 追加新条目到现有 ARCHIVE.md |

### 3.3 MemoryManager 空壳

```typescript
// memory-manager.ts:717-729
async compress(): Promise<CompressionResult> {
  // stub — TASK024 will implement
  return { discarded: 0, merged: 0, archived: 0, beforeTokens: 0, afterTokens: 0 }
}

// memory-manager.ts:731-737
async getAllArchivedEntries(): Promise<V2MemoryEntry[]> {
  // stub — TASK024 will implement
  return []
}
```

**V2Components 缺失字段：** `compressor?: MemoryCompressor`、`scheduler?: CheckpointScheduler`

### 3.4 MemoryEventBus 不足

现有仅 7 行，只有 `emitGuardrailRepeated()` 一个方法。需新增：

| 事件 | 用途 |
|------|------|
| `memory:checkpoint-started` | 检查点开始运行 |
| `memory:checkpoint-completed` | 检查点完成（含 record） |
| `memory:checkpoint-failed` | 检查点最终失败 |
| `memory:compression-started` | 压缩开始 |
| `memory:compression-completed` | 压缩完成 |
| `memory:manual-checkpoint` | UI 手动触发入口 |

### 3.5 不存在的文件

| 文件 | 状态 |
|------|------|
| `checkpoint-scheduler.ts` | **不存在**，需新建 |
| `memory-compressor.ts` | **不存在**，需新建 |
| `tests/memory/checkpoint-scheduler.test.ts` | **不存在**，需新建 |
| `tests/memory/memory-compressor.test.ts` | **不存在**，需新建 |

---

## 四、类型设计变更

### 4.1 CheckpointTrigger 重写

```typescript
// 现有（discriminated union，过于复杂）
export type CheckpointTrigger =
  | { type: 'timer' }
  | { type: 'interaction_count'; count: number }
  | { type: 'manual' }
  | { type: 'key_event'; event: string }

// 重写为（与规范 sprint3.2-memory.md 需求 3.2.3 一致）
export type CheckpointTrigger = 'timer' | 'interaction_count' | 'manual' | 'key_event'
```

**理由：** 规范中 `CheckpointScheduler.maybeRun(trigger)` 直接传字符串，交互计数由内部状态管理而非 trigger 参数携带。discriminated union 在此场景无额外类型安全收益。

### 4.2 CheckpointRecord 重写

```typescript
export interface CheckpointRecord {
  id: string                                    // 'chk-{Date.now()}-{randomHex(4)}'
  trigger: CheckpointTrigger
  startedAt: string                             // ISO 8601
  completedAt?: string                          // ISO 8601，完成/失败/中止时填充
  status: 'running' | 'success' | 'failed' | 'aborted'
  report?: ExtractionReport                     // 成功时附带
  errorMessage?: string                         // 失败时附带
}
```

### 4.3 CompressionResult 重写

```typescript
export interface CompressionResult {
  discarded: MemoryEntry[]                      // 被淘汰的条目
  merged: Array<{ original: MemoryEntry[]; merged: MemoryEntry }>  // 合并组
  archived: MemoryEntry[]                       // 被归档的条目
  beforeTokens: number
  afterTokens: number
  snapshotPath: string                          // 快照文件路径
}
```

### 4.4 MemoryConfig 新增

```typescript
export interface MemoryConfig {
  checkpointIntervalMs: number                  // 默认 7200000 (2h)
  interactionThreshold: number                  // 默认 50
  extractorModel: string                        // 默认 'claude-haiku'
  compressionThreshold: number                  // 默认 12000
  compressionTargetMin: number                  // 默认 8000
  compressionTargetMax: number                  // 默认 12000
  searchWeights: { vector: number; bm25: number; timeDecay: number }  // 默认 {0.6, 0.3, 0.1}
  embeddingProvider: 'local' | 'cloud'          // 默认 'local'
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  checkpointIntervalMs: 7200000,
  interactionThreshold: 50,
  extractorModel: 'claude-haiku',
  compressionThreshold: 12000,
  compressionTargetMin: 8000,
  compressionTargetMax: 12000,
  searchWeights: { vector: 0.6, bm25: 0.3, timeDecay: 0.1 },
  embeddingProvider: 'local',
}
```

### 4.5 向后兼容处理

- `CheckpointTrigger` 从 discriminated union 改为字符串联合：因 TASK024 尚未实现，无下游消费者，直接重写
- `CheckpointRecord` 结构完全变更：同上
- `CompressionResult` 结构完全变更：同上
- `ExtractionReport`、`EvolutionEvent` 等已由 TASK023 定型的类型**不变更**

---

## 五、分步实施计划

### 阶段 A：类型层（Step 1） — 预计 0.5 天

#### A1：重写 types.ts 检查点/压缩相关类型

**文件：** `sibylla-desktop/src/main/services/memory/types.ts`

**操作：**
1. 将 `CheckpointTrigger` 从 discriminated union 重写为 `'timer' | 'interaction_count' | 'manual' | 'key_event'`
2. 重写 `CheckpointRecord`：新增 `startedAt`/`completedAt`/`report`/`errorMessage`，扩展 `status` 为 `'running' | 'success' | 'failed' | 'aborted'`，移除 `entryCount`
3. 重写 `CompressionResult`：`discarded`/`archived` 改为 `MemoryEntry[]`，`merged` 改为 `Array<{ original: MemoryEntry[]; merged: MemoryEntry }>`，新增 `snapshotPath`
4. 新增 `MemoryConfig` 接口（8 个字段）+ `DEFAULT_MEMORY_CONFIG` 常量

**验证：** `npm run typecheck` 通过

---

### 阶段 B：CheckpointScheduler（Step 2） — 预计 1.5 天

#### B1：创建 checkpoint-scheduler.ts 骨架

**文件：** `sibylla-desktop/src/main/services/memory/checkpoint-scheduler.ts`（新建）

**构造函数设计：**

```typescript
export class CheckpointScheduler {
  private lastCheckpoint: Date = new Date(0)
  private interactionCount: number = 0
  private isRunning: boolean = false
  private queue: CheckpointTrigger[] = []
  private readonly MAX_QUEUE = 3
  private currentRecord?: CheckpointRecord
  private abortFlag: boolean = false
  private timerRef?: NodeJS.Timeout

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly extractor: MemoryExtractor,
    private readonly indexer: SimilarityIndexProvider | null,
    private readonly evolutionLog: EvolutionLog,
    private readonly compressor: MemoryCompressor | null,
    private readonly eventBus: MemoryEventBus,
    private readonly config: MemoryConfig,
    private readonly logger: Logger = logger,
  ) {}
}
```

**依赖注入说明：**
- `indexer` 可选（TASK025 填充），`compressor` 可选（阶段 C 实现）
- `config` 使用 `DEFAULT_MEMORY_CONFIG` 作为默认值，允许外部覆盖
- `memoryManager` 提供日志读取/条目获取/报告应用/工作区上下文

#### B2：实现 start() 方法

```typescript
start(): void
```

1. 启动定时器：`this.timerRef = setInterval(() => this.maybeRun('timer'), 60 * 1000)`
2. 监听 `user-interaction` 事件：递增 `interactionCount`，当 `>= config.interactionThreshold` 时调用 `maybeRun('interaction_count')`
3. 监听 `spec-file-major-edit` 事件：调用 `maybeRun('key_event')`
4. 监听 `guardrail-repeated` 事件：调用 `maybeRun('key_event')`
5. 监听 `memory:manual-checkpoint` 事件：调用 `maybeRun('manual')`

#### B3：实现 stop() 方法

```typescript
async stop(): Promise<void>
```

1. 清除定时器：`clearInterval(this.timerRef)`
2. 移除所有 EventBus 事件监听：`this.eventBus.removeAllListeners()`
3. 若 `isRunning` → 设置 `abortFlag = true`，等待当前 run 完成（轮询 `isRunning`，超时 30s）
4. `this.logger.info('memory.checkpoint.scheduler.stopped')`

#### B4：实现 maybeRun(trigger) 方法

```typescript
private async maybeRun(trigger: CheckpointTrigger): Promise<void>
```

**逻辑：**

1. `trigger === 'timer'` 时：
   - 检查 `Date.now() - this.lastCheckpoint.getTime() < config.checkpointIntervalMs`
   - 若未到时间 → return
2. `trigger === 'interaction_count'` 时：
   - 直接允许（计数器前置检查已在 start() 的事件监听中完成）
3. `trigger === 'manual' | 'key_event'` 时：
   - 直接允许
4. 若 `isRunning`：
   - `queue.length < MAX_QUEUE` → 入队
   - 否则 → 丢弃 + `logger.warn('memory.checkpoint.queue_full_discarded', { trigger })`
   - return
5. 若非 running → 调用 `await this.run(trigger)`
6. run 完成后处理队列：`const next = this.queue.shift()`，若存在 → `await this.run(next)`

#### B5：实现 run(trigger) 方法

```typescript
private async run(trigger: CheckpointTrigger): Promise<void>
```

**完整流水线：**

1. `this.isRunning = true`，`this.abortFlag = false`
2. 创建 `CheckpointRecord`：`{ id: generateId(), trigger, startedAt: new Date().toISOString(), status: 'running' }`
3. `this.currentRecord = record`
4. `this.eventBus.emitCheckpointStarted(record)`
5. 获取增量日志：`const logs = await this.memoryManager.getLogsSince(this.lastCheckpoint.toISOString())`
6. 若 `logs.length === 0`：
   - `record.status = 'success'`，`record.completedAt = new Date().toISOString()`
   - 跳到 finally
7. 获取现有记忆：`const existingMemory = await this.memoryManager.getAllEntries()`
8. 使用 `withRetry()` 调用提取器：
   ```typescript
   const report = await this.withRetry(
     () => this.extractor.extract({
       logs,
       existingMemory,
       workspaceContext: this.memoryManager.getWorkspaceContext(),
     }),
     3,
   )
   ```
9. 若 `this.abortFlag` → 标记 `record.status = 'aborted'`，跳到 finally
10. 应用提取报告：`await this.memoryManager.applyExtractionReport(report)`
11. 更新索引：`if (this.indexer?.isAvailable()) { /* TASK025: this.indexer.indexReport(report) */ }`
12. 记录演化日志：`await this.evolutionLog.append({ ... })`
13. 更新状态：`this.lastCheckpoint = new Date()`，`this.interactionCount = 0`
14. `record.status = 'success'`，`record.report = report`，`record.completedAt = new Date().toISOString()`
15. 检查压缩触发：`if (report) { const snapshot = await this.memoryManager.getAllEntries(); const tokens = estimateTokensFromEntries(snapshot); if (tokens > this.config.compressionThreshold && this.compressor) { await this.compressor.compress() } }`
16. `this.logger.info('memory.checkpoint.completed', { trigger, added: report.added.length, merged: report.merged.length, discarded: report.discarded.length, durationMs: report.durationMs })`
17. catch 块：`record.status = 'failed'`，`record.errorMessage = String(err)`，`record.completedAt = new Date().toISOString()`，`this.logger.error(...)`，`this.eventBus.emitCheckpointFailed(record)`
18. finally：持久化检查点记录到 `checkpoints.jsonl`，`this.eventBus.emitCheckpointCompleted(record)`，`this.isRunning = false`，`this.currentRecord = undefined`

#### B6：实现 withRetry()

```typescript
private async withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T>
```

- 延迟数组：`[1000, 5000, 30000]`
- `for (let attempt = 0; attempt < maxAttempts; attempt++)`
- 检查 `this.abortFlag`：若已设置 → 抛出 `Error('Checkpoint aborted')`
- 失败时 `await this.sleep(delays[attempt])`（仅 `attempt < maxAttempts - 1`）
- 每次重试记录 `logger.warn('memory.checkpoint.retry', { attempt, maxAttempts, err })`
- 最后一次失败抛出 `lastErr`

#### B7：实现辅助方法

| 方法 | 实现 |
|------|------|
| `generateId()` | `chk-${Date.now()}-${randomHex(4)}` |
| `abortCurrentRun()` | 设置 `this.abortFlag = true` |
| `sleep(ms)` | `new Promise(resolve => setTimeout(resolve, ms))` |
| `getLastCheckpoint()` | 返回 `this.lastCheckpoint`（供 MemoryManager.getStats 使用） |
| `isCheckpointRunning()` | 返回 `this.isRunning` |
| `triggerManualCheckpoint()` | `this.maybeRun('manual')`（供 IPC handler 调用） |

---

### 阶段 C：MemoryCompressor（Step 3） — 预计 1.5 天

#### C1：创建 memory-compressor.ts 骨架

**文件：** `sibylla-desktop/src/main/services/memory/memory-compressor.ts`（新建）

**构造函数设计：**

```typescript
export class MemoryCompressor {
  private readonly TARGET_MIN: number
  private readonly TARGET_MAX: number
  private readonly TRIGGER_THRESHOLD: number

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly aiGateway: AiGatewayClient,
    private readonly indexer: SimilarityIndexProvider | null,
    private readonly evolutionLog: EvolutionLog,
    private readonly fileManager: MemoryFileManager,
    private readonly config: MemoryConfig,
    private readonly logger: Logger = logger,
  ) {
    this.TARGET_MIN = config.compressionTargetMin
    this.TARGET_MAX = config.compressionTargetMax
    this.TRIGGER_THRESHOLD = config.compressionThreshold
  }
}
```

#### C2：实现 compress() 主方法

```typescript
async compress(): Promise<CompressionResult>
```

**三阶段流水线：**

1. `const snapshotPath = await this.createSnapshot()`
2. `let entries = await this.memoryManager.getAllEntries()`
3. `const beforeTokens = this.estimateTokens(entries)`
4. 初始化 `result: CompressionResult = { discarded: [], merged: [], archived: [], beforeTokens, afterTokens: 0, snapshotPath }`
5. **Stage 1 — 淘汰：**
   - `const [kept1, discarded] = partition(entries, e => this.shouldDiscard(e))`
   - `result.discarded = discarded`
   - `entries = kept1`
   - 若 `this.estimateTokens(entries) <= this.TARGET_MAX` → 跳到 finalize
6. **Stage 2 — 合并：**
   - `const mergeResult = await this.mergeSimilar(entries)`
   - `entries = mergeResult.entries`，`result.merged = mergeResult.merges`
   - 若 `this.estimateTokens(entries) <= this.TARGET_MAX` → 跳到 finalize
7. **Stage 3 — 归档：**
   - `const archiveResult = this.archiveStale(entries)`
   - `entries = archiveResult.active`，`result.archived = archiveResult.archived`
8. **finalize：** `return await this.finalize(entries, result)`

#### C3：实现 shouldDiscard(entry)

```typescript
private shouldDiscard(entry: MemoryEntry): boolean
```

- `entry.locked` → `false`（豁免）
- `entry.confidence < 0.5` && `entry.hits === 0` && `this.ageInDays(entry.createdAt) > 30` → `true`

#### C4：实现 mergeSimilar(entries)

```typescript
private async mergeSimilar(entries: MemoryEntry[]): Promise<{
  entries: MemoryEntry[]
  merges: CompressionResult['merged']
}>
```

1. `const clusters = await this.clusterBySimilarity(entries, 0.8)`
2. 遍历每个 cluster：
   - `cluster.length === 1` → 保留原样
   - `cluster.some(e => e.locked)` → 跳过合并，保留原样
   - `cluster.length > 1` → 调用 `await this.llmMerge(cluster)` → 记录到 `merges`
3. 返回 `{ entries: result[], merges }`

#### C5：实现 llmMerge(cluster)

```typescript
private async llmMerge(cluster: MemoryEntry[]): Promise<MemoryEntry>
```

1. `const session = this.aiGateway.createSession({ role: 'memory-compressor' })`
2. 构建 prompt：列出 cluster 中所有条目内容，要求合并为一条连贯的综合条目
3. system prompt："You merge related memories into concise, coherent single entries. Preserve all unique information, eliminate duplication."
4. 调用 `session.chat({ model: this.config.extractorModel, messages: [...], temperature: 0.3 })`
5. 构建合并后 MemoryEntry：
   - `id: 'merged-{Date.now()}'`
   - `section: cluster[0].section`
   - `content: response.content`
   - `confidence: cluster.reduce((sum, e) => sum + e.confidence * e.hits, 0) / cluster.reduce((sum, e) => sum + e.hits, 0)`（加权平均，hits=0 时用 1 代替避免除零）
   - `hits: cluster.reduce((sum, e) => sum + e.hits, 0)`
   - `createdAt: cluster.map(e => e.createdAt).sort()[0]`
   - `updatedAt: new Date().toISOString()`
   - `sourceLogIds: [...new Set(cluster.flatMap(e => e.sourceLogIds))]`
   - `locked: false`
   - `tags: [...new Set(cluster.flatMap(e => e.tags))]`
6. `session.close()`

#### C6：实现 archiveStale(entries)

```typescript
private archiveStale(entries: MemoryEntry[]): { active: MemoryEntry[]; archived: MemoryEntry[] }
```

1. `const [active, archived] = partition(entries, e => !(e.hits === 0 && this.ageInDays(e.createdAt) > 90 && !e.locked))`
2. 将 `archived` 条目写入 ARCHIVE.md：`await this.fileManager.appendToArchive(archived)`
3. 返回 `{ active, archived }`

#### C7：实现 createSnapshot()

```typescript
private async createSnapshot(): Promise<string>
```

1. 读取当前 MEMORY.md 内容：`const content = await fs.readFile(this.fileManager.memoryPath(), 'utf-8')`
2. 生成路径：`path.join(this.workspaceRoot, '.sibylla/memory/snapshots/{Date.now()}.md')`
3. 确保 snapshots 目录存在：`await fs.mkdir(path.dirname(snapshotPath), { recursive: true })`
4. 写入快照文件：`await fs.writeFile(snapshotPath, content, 'utf-8')`
5. 返回 `snapshotPath`

**注意：** 需从 `MemoryFileManager` 获取 `workspaceRoot`。方案：`MemoryCompressor` 构造时注入 `workspaceRoot: string`，或 `fileManager` 新增 `getWorkspaceRoot()` 方法。

#### C8：实现 finalize(entries, result)

```typescript
private async finalize(entries: MemoryEntry[], result: CompressionResult): Promise<CompressionResult>
```

1. 构建 `MemoryFileSnapshot` 并保存：`await this.fileManager.save({ metadata: { version: 2, lastCheckpoint: new Date().toISOString(), totalTokens: this.estimateTokens(entries), entryCount: entries.length }, entries })`
2. 为每个淘汰条目写演化日志：`await this.evolutionLog.append({ type: 'delete', entryId, section, before, trigger: { source: 'compression' }, rationale: 'discarded: low confidence + zero hits + age > 30d' })`
3. 为每个合并组写演化日志：`await this.evolutionLog.append({ type: 'merge', entryId: merged.id, section, before, after, trigger: { source: 'compression' }, rationale: 'merged: similarity > 0.8' })`
4. 为每个归档条目写演化日志：`await this.evolutionLog.append({ type: 'archive', entryId, section, before, trigger: { source: 'compression' }, rationale: 'archived: zero hits + age > 90d' })`
5. 记录压缩结果到 `compressions.jsonl`：`await fs.appendFile(compressionsPath, JSON.stringify({ timestamp: new Date().toISOString(), beforeTokens: result.beforeTokens, afterTokens: result.afterTokens, discardedCount: result.discarded.length, mergedCount: result.merged.length, archivedCount: result.archived.length }) + '\n', 'utf-8')`
6. 清理超过 24 小时的旧快照：`await this.cleanOldSnapshots()`
7. `result.afterTokens = this.estimateTokens(entries)`
8. 返回 `result`

#### C9：实现 estimateTokens(entries)

```typescript
private estimateTokens(entries: MemoryEntry[]): number
```

- 汇总所有条目 content 的 token 估算
- 复用 `MemoryFileManager.estimateTokens()` 逻辑：`entries.reduce((sum, e) => sum + this.estimateSingleTokens(e.content), 0)`
- CJK 优化：非 CJK 按 4 字符/token，CJK 按 2 字符/token

#### C10：实现辅助方法

| 方法 | 实现 |
|------|------|
| `ageInDays(createdAt)` | `(Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)` |
| `clusterBySimilarity(entries, threshold)` | 优先使用 indexer 向量相似度（若可用），降级为文本 Jaccard 相似度（复用 MemoryExtractor.textSimilarity 逻辑），返回 `MemoryEntry[][]` |
| `partition(entries, predicate)` | `[entries.filter(predicate), entries.filter(e => !predicate(e))]` |
| `cleanOldSnapshots()` | 读取 `.sibylla/memory/snapshots/` 目录，删除 `mtime < Date.now() - 24h` 的文件 |

#### C11：实现 undoLastCompression()

```typescript
async undoLastCompression(): Promise<void>
```

1. 读取 `.sibylla/memory/snapshots/` 目录，按文件名（时间戳）降序排列
2. 取最新快照：`const latestSnapshot = snapshots[0]`
3. 若无快照 → 抛出 `Error('No compression snapshot found')`
4. 检查快照时间：`const snapshotAge = Date.now() - parseInt(path.basename(latestSnapshot, '.md'))`
5. 若 `snapshotAge > 24 * 60 * 60 * 1000` → 抛出 `Error('Snapshot older than 24 hours, cannot undo')`
6. 读取快照内容：`const content = await fs.readFile(latestSnapshot, 'utf-8')`
7. 解析快照为 `MemoryFileSnapshot`：`const snapshot = await this.fileManager.parseSnapshot(content)`
8. 保存恢复：`await this.fileManager.save(snapshot)`
9. 写入演化日志：`await this.evolutionLog.append({ type: 'manual-edit', entryId: 'all', section: 'project_convention', trigger: { source: 'manual' }, rationale: 'undo compression' })`
10. `this.logger.info('memory.compression.undo.success', { snapshotPath: latestSnapshot })`

---

### 阶段 D：ARCHIVE.md 读写（Step 4） — 预计 0.5 天

#### D1：扩展 MemoryFileManager — 新增归档方法

**文件：** `sibylla-desktop/src/main/services/memory/memory-file-manager.ts`

**新增方法：**

1. **`archivePath()`** — 返回 `path.join(this.workspaceRoot, '.sibylla/memory/ARCHIVE.md')`

2. **`loadArchive()`** — 读取并解析 ARCHIVE.md
   ```typescript
   async loadArchive(): Promise<MemoryEntry[]>
   ```
   - 读取 ARCHIVE.md（不存在则返回空数组）
   - 解析格式：与 MEMORY.md 相同的 v2 格式（YAML frontmatter + `<!-- @entry -->` 结构）
   - 复用现有 `parseMarkdown()` + `parseEntries()` 逻辑
   - 所有条目均视为 archived

3. **`saveArchive(entries)`** — 序列化并原子写入 ARCHIVE.md
   ```typescript
   async saveArchive(entries: MemoryEntry[]): Promise<void>
   ```
   - 构建 `MemoryFileSnapshot`（metadata.version=2, totalTokens=估算, entryCount=entries.length）
   - 使用 `serialize()` 生成 Markdown
   - 调用 `atomicWrite()` 写入

4. **`appendToArchive(newEntries)`** — 追加新条目到现有归档
   ```typescript
   async appendToArchive(newEntries: MemoryEntry[]): Promise<void>
   ```
   - `const existing = await this.loadArchive()`
   - `const merged = [...existing, ...newEntries]`
   - `await this.saveArchive(merged)`

5. **`parseSnapshot(content)`** — 解析 Markdown 内容为 MemoryFileSnapshot（供 undoLastCompression 使用）
   ```typescript
   parseSnapshot(content: string): MemoryFileSnapshot
   ```
   - 复用 `parseMarkdown()` 逻辑

---

### 阶段 E：MemoryManager 填充（Step 5） — 预计 0.5 天

#### E1：扩展 V2Components 接口

**文件：** `sibylla-desktop/src/main/services/memory-manager.ts`

```typescript
export interface V2Components {
  fileManager: MemoryFileManager
  logStore: LogStore
  evolutionLog?: EvolutionLog
  compressor?: MemoryCompressor    // 新增
  scheduler?: CheckpointScheduler  // 新增
}
```

#### E2：实现 compress()

替换现有空壳（lines 717-729）：

```typescript
async compress(): Promise<CompressionResult> {
  if (!this.v2Components?.compressor) {
    throw new Error('v2 not available: MemoryCompressor not initialized')
  }
  return await this.v2Components.compressor.compress()
}
```

#### E3：实现 getAllArchivedEntries()

替换现有空壳（lines 731-737）：

```typescript
async getAllArchivedEntries(): Promise<V2MemoryEntry[]> {
  if (!this.v2Components?.fileManager) {
    throw new Error('v2 not available: MemoryFileManager not initialized')
  }
  return await this.v2Components.fileManager.loadArchive()
}
```

#### E4：新增 undoLastCompression()

```typescript
async undoLastCompression(): Promise<void> {
  if (!this.v2Components?.compressor) {
    throw new Error('v2 not available: MemoryCompressor not initialized')
  }
  await this.v2Components.compressor.undoLastCompression()
}
```

#### E5：新增 triggerManualCheckpoint()

```typescript
async triggerManualCheckpoint(): Promise<CheckpointRecord | null> {
  if (!this.v2Components?.scheduler) {
    throw new Error('v2 not available: CheckpointScheduler not initialized')
  }
  await this.v2Components.scheduler.triggerManualCheckpoint()
  return null // 异步执行，不等待完成
}
```

---

### 阶段 F：EventBus 扩展 + Trace 信号接入（Step 6-7） — 预计 0.5 天

#### F1：扩展 MemoryEventBus

**文件：** `sibylla-desktop/src/main/services/memory/memory-event-bus.ts`

新增事件发射方法：

```typescript
export class MemoryEventBus extends EventEmitter {
  // 现有
  emitGuardrailRepeated(ruleId: string, count: number): void {
    this.emit('guardrail-repeated', { ruleId, count })
  }

  // 新增 — 检查点事件
  emitCheckpointStarted(record: CheckpointRecord): void {
    this.emit('memory:checkpoint-started', record)
  }
  emitCheckpointCompleted(record: CheckpointRecord): void {
    this.emit('memory:checkpoint-completed', record)
  }
  emitCheckpointFailed(record: CheckpointRecord): void {
    this.emit('memory:checkpoint-failed', record)
  }

  // 新增 — 手动触发入口
  emitManualCheckpoint(): void {
    this.emit('memory:manual-checkpoint')
  }

  // 新增 — 压缩事件
  emitCompressionStarted(): void {
    this.emit('memory:compression-started')
  }
  emitCompressionCompleted(result: CompressionResult): void {
    this.emit('memory:compression-completed', result)
  }

  // 新增 — Spec 文件大幅修改
  emitSpecFileMajorEdit(filePath: string): void {
    this.emit('spec-file-major-edit', { filePath })
  }

  // 新增 — 用户交互（供 CheckpointScheduler 计数）
  emitUserInteraction(): void {
    this.emit('user-interaction')
  }
}
```

#### F2：确认 Trace 信号接入链路

TASK023 已实现 `appendHarnessTraceV2()` + `detectKeyEvents()`，链路：

```
Harness → appendHarnessTraceV2(event) → LogStore.append() + detectKeyEvents(event)
                                                    ↓
                                    guardrail_triggered 5+ 次/24h
                                                    ↓
                                    eventBus.emitGuardrailRepeated()
                                                    ↓
                                    CheckpointScheduler 监听 'guardrail-repeated'
                                                    ↓
                                    maybeRun('key_event')
```

本任务需补充：
1. 在 `CheckpointScheduler.start()` 中添加对 `guardrail-repeated` 事件的监听（已在 B2 步骤中包含）
2. 补充 `spec-file-major-edit` 事件的发射源：在 `MemoryManager` 的文件变更检测或 file-watcher 中检测 Spec 文件大幅修改时调用 `eventBus.emitSpecFileMajorEdit(filePath)`
3. 确保 `appendHarnessTrace` 写入失败不阻塞：TASK023 已用 try/catch + `logger.warn` 实现，无需额外处理

---

### 阶段 G：桶导出更新 — 预计 0.1 天

#### G1：更新 memory/index.ts

**文件：** `sibylla-desktop/src/main/services/memory/index.ts`

新增导出：
- 类型：`CheckpointTrigger`, `CheckpointRecord`, `CompressionResult`, `MemoryConfig`
- 常量：`DEFAULT_MEMORY_CONFIG`
- 类：`CheckpointScheduler`, `MemoryCompressor`

---

### 阶段 H：单元测试（Step 8） — 预计 1.5 天

#### H1：checkpoint-scheduler.test.ts

**文件：** `sibylla-desktop/tests/memory/checkpoint-scheduler.test.ts`（新建）

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | 定时触发 | mock `lastCheckpoint` 为 3 小时前 + 有日志 → maybeRun 被调用 |
| 2 | 交互计数触发 | mock 50 次交互事件 → maybeRun('interaction_count') 被调用 |
| 3 | 手动触发 | emit 'memory:manual-checkpoint' → maybeRun('manual') 立即执行 |
| 4 | 关键事件触发 | emit 'guardrail-repeated' → maybeRun('key_event') 被调用 |
| 5 | 队列管理 | isRunning 时后续触发入队（≤3），队列满时丢弃 + 记录 warning |
| 6 | 失败重试 | mock extractor.extract() 失败 2 次后成功 → 验证重试次数和最终成功 |
| 7 | 最终失败 | mock 3 次全部失败 → 验证 record.status='failed' + errorMessage + 事件发射 |
| 8 | 无日志跳过 | getLogsSince 返回空数组 → record.status='success'，不调用 extractor |
| 9 | 优雅中止 | 设置 abortFlag 后 → record.status='aborted' |
| 10 | checkpoints.jsonl 持久化 | run 完成后 → 文件包含对应 JSON 行 |

**Mock 策略：**
- `MemoryManager`：mock `getLogsSince()`、`getAllEntries()`、`applyExtractionReport()`、`getWorkspaceContext()`
- `MemoryExtractor`：mock `extract()` 控制成功/失败
- `EvolutionLog`：mock `append()`
- `MemoryEventBus`：spy on `emit()` 方法
- `MemoryCompressor`：mock `compress()` 返回预设结果
- **时间 mock**：使用 `jest.useFakeTimers()` 控制 `Date.now()` 和 `setInterval`

#### H2：memory-compressor.test.ts

**文件：** `sibylla-desktop/tests/memory/memory-compressor.test.ts`（新建）

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | 三阶段压缩按序执行 | 构造 > 12K tokens 的条目集 → 验证 discard → merge → archive 依次执行 |
| 2 | 淘汰阶段 | confidence < 0.5 + hits=0 + age>30d 的条目被淘汰 |
| 3 | 淘汰豁免 | locked=true 的条目不被淘汰 |
| 4 | 合并阶段 | 相似度 > 0.8 的条目被合并 |
| 5 | LLM 合并调用和结果 | llmMerge() 调用 AiGatewaySession.chat()；返回的合并条目字段正确 |
| 6 | 归档阶段 | hits=0 + age>90d 的条目归档到 ARCHIVE.md |
| 7 | token 阈值检查 | Stage 1 完成后 tokens ≤ TARGET_MAX → 跳过 Stage 2/3 |
| 8 | 快照创建 | compress() 前创建 `.sibylla/memory/snapshots/{timestamp}.md` |
| 9 | undoLastCompression 成功恢复 | 24 小时内快照 → 恢复 MEMORY.md + 写入演化日志 |
| 10 | undoLastCompression 超时拒绝 | 超过 24 小时快照 → 抛出错误 |
| 11 | compressions.jsonl 持久化 | compress() 完成后 → 文件包含 JSON 行 |

**Mock 策略：**
- `AiGatewayClient`：mock `createSession()` 返回 mock session
- `AiGatewaySession`：mock `chat()` 返回预设合并文本
- `MemoryFileManager`：mock `load()`/`save()`/`loadArchive()`/`appendToArchive()`
- `EvolutionLog`：mock `append()`
- **文件系统 mock**：使用 `os.tmpdir()` 创建临时工作目录，测试后清理

---

### 阶段 I：集成验证（Step 9） — 预计 0.5 天

#### I1：TypeScript 类型检查

```bash
npm run typecheck
```

确保所有新增/修改文件类型无误。

#### I2：Lint 检查

```bash
npm run lint
```

#### I3：运行测试

```bash
npm run test
```

确保所有测试通过（包括 TASK022/023 已有测试不被破坏）。

#### I4：手动验证检查点流水线

1. 准备测试日志（JSONL 格式，10 条）
2. 配置 AiGatewayClient 指向 mock server 或使用本地 fallback
3. 触发手动检查点 → 确认提取 → 应用 → 演化日志 → 检查点记录完整链路
4. 验证 `checkpoints.jsonl` 包含正确记录

#### I5：手动验证压缩流水线

1. 构造 > 12K tokens 的 MEMORY.md
2. 触发压缩 → 确认三阶段执行 → 快照创建 → 结果持久化
3. 验证 `compressions.jsonl` 包含正确记录
4. 验证 ARCHIVE.md 被正确写入
5. 验证 undoLastCompression 恢复功能

---

## 六、验收标准追踪

### 心跳检查点

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 距上次 > 2h + ≥1 条日志触发 | B4 maybeRun('timer') | H1-1 |
| 2 | 交互 ≥ 50 次触发 | B2 start() + B4 | H1-2 |
| 3 | 手动触发立即执行 | B2 start() + B4 | H1-3 |
| 4 | 关键事件触发 | B2 start() + F2 | H1-4 |
| 5 | 队列管理（≤3，超出丢弃） | B4 maybeRun() | H1-5 |
| 6 | 失败重试 3 次指数退避 | B6 withRetry() | H1-6 |
| 7 | 最终失败记录+UI 通知 | B5 catch 块 | H1-7 |
| 8 | 不阻塞用户交互 | async 方法 + 事件驱动 | 架构级保障 |
| 9 | 优雅中止（abort 标志） | B3 stop() + B5 abort 检查 | H1-9 |
| 10 | 完成摘要日志 | B5 logger.info | H1-6/7/8 |
| 11 | checkpoints.jsonl 持久化 | B5 finally 块 | H1-10 |

### 记忆压缩

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | > 12K tokens 触发压缩 | B5 Step 15 | H2-1 |
| 2 | 三阶段按序执行 | C2 compress() | H2-1 |
| 3 | 每阶段后检查 totalTokens | C2 各阶段间条件跳转 | H2-7 |
| 4 | 压缩到 ≤ 8K tokens 停止 | C2 TARGET_MIN 检查 | H2-1 |
| 5 | 压缩前创建 24h 快照 | C7 createSnapshot() | H2-8 |
| 6 | 24 小时内可撤销 | C11 undoLastCompression() | H2-9 |
| 7 | LLM 合并产出连贯条目 | C5 llmMerge() | H2-5 |
| 8 | locked 条目豁免 | C3 shouldDiscard() + C4 mergeSimilar() | H2-3/4 |
| 9 | 归档条目保留在索引 | C6 archiveStale() | H2-6 |
| 10 | compressions.jsonl 持久化 | C8 finalize() | H2-11 |

### Trace 信号接入

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | appendHarnessTrace 写入 LogStore | TASK023 已实现 | — |
| 2 | Guardrail 5+ 次触发 guardrail-repeated | TASK023 detectKeyEvents() + F1 | H1-4 |
| 3 | guardrail-repeated 被 Scheduler 监听 | B2 start() + F2 | H1-4 |
| 4 | Trace 写入失败不阻塞 | TASK023 已实现 | — |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| LLM 合并丢失独特信息 | 高 | system prompt 强调"保留所有独特信息"；24h 撤销窗口；合并前快照 |
| CheckpointScheduler 定时器与 EventBus 事件竞争 | 中 | maybeRun() 中 isRunning 检查 + 队列机制；timer 触发前检查时间条件 |
| 压缩过程中应用崩溃 | 高 | 快照在压缩第一步创建；下次启动检查是否有未完成压缩（可从 checkpoints.jsonl 判断） |
| ARCHIVE.md 与 MEMORY.md 格式不一致 | 中 | 复用 MemoryFileManager 相同的序列化/解析逻辑 |
| 向量索引不可用时合并精度低 | 中 | 降级为文本 Jaccard 相似度，阈值从 0.8 降至 0.7 |
| CheckpointTrigger 类型变更破坏下游 | 低 | TASK024 尚未实现，无下游消费者 |
| AiGatewaySession.chat() 无 responseFormat | 低 | prompt 工程要求 JSON only（与 TASK023 相同策略） |
| 旧快照清理删除用户可能需要的文件 | 低 | 仅删除 > 24h 的快照；undoLastCompression 使用最新快照 |

---

## 八、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | types.ts 全部类型扩展完成 |
| Day 1 下午 - Day 2 | B1-B7 | checkpoint-scheduler.ts 完整实现 |
| Day 3 | C1-C11 | memory-compressor.ts 完整实现 |
| Day 4 上午 | D1 + E1-E5 + F1-F2 + G1 | ARCHIVE.md + MemoryManager 填充 + EventBus 扩展 + 导出更新 |
| Day 4 下午 - Day 5 上午 | H1-H2 | 2 个测试文件全部通过 |
| Day 5 下午 | I1-I5 | 集成验证通过 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-20
**维护者**: Sibylla 架构团队
