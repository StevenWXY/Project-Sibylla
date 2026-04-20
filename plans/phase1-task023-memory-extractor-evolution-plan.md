# PHASE1-TASK023: 精选记忆提取器与演化日志 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task023_memory-extractor-evolution.md](../specs/tasks/phase1/phase1-task023_memory-extractor-evolution.md)
> 创建日期：2026-04-20
> 最后更新：2026-04-20

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK023 |
| **任务标题** | 精选记忆提取器与演化日志 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | ✅ TASK022（types.ts + MemoryFileManager + LogStore + MemoryManager 门面 + AiGatewaySession） |

### 1.1 目标

实现两个核心智能组件——LLM 驱动的精选记忆提取器（MemoryExtractor）和记忆演化日志（EvolutionLog），以及 MemoryManager 中 applyExtractionReport 和 detectKeyEvents 的实际实现。三者组合实现"AI 持续学习团队工作方式"的核心能力。

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| 类型扩展 | `src/main/services/memory/types.ts` | 完善 ExtractionInput/Candidate/Report、EvolutionEvent/Type、ExtractorConfig |
| 提取器 | `src/main/services/memory/memory-extractor.ts` | 新建：LLM 驱动增量提取、置信度过滤、去重合并、文本相似度降级 |
| 演化日志 | `src/main/services/memory/evolution-log.ts` | 新建：CHANGELOG.md 追加、查询、轮转、格式化 |
| 管理器填充 | `src/main/services/memory-manager.ts` | 实现 applyExtractionReport()、detectKeyEvents() |
| 桶导出更新 | `src/main/services/memory/index.ts` | 新增导出 |
| 单元测试 | `tests/memory/memory-extractor.test.ts` | 提取器 7 组测试 |
| 单元测试 | `tests/memory/evolution-log.test.ts` | 演化日志 6 组测试 |
| 单元测试 | `tests/memory/apply-report.test.ts` | 应用报告 5 组测试 |

### 1.3 范围边界

**包含：** MemoryExtractor、EvolutionLog、applyExtractionReport、detectKeyEvents、单元测试

**不包含：** CheckpointScheduler（TASK024）、MemoryCompressor（TASK024）、MemoryIndexer（TASK025）、MemoryPanel UI（TASK026）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | §四 TS 严格模式禁止 any；§五 记忆即演化、日志 append-only；§六 原子写入先写临时文件再替换 | 全局约束 |
| `specs/design/architecture.md` | §3.2 invoke/handle IPC 模式；主进程与渲染进程严格隔离 | 组件运行在主进程 |
| `specs/design/memory-system-design.md` | 三层存储架构；MEMORY.md 8-12K tokens；心跳检查点；预压缩冲洗 | 提取器架构参考 |
| `specs/requirements/phase1/sprint3.2-memory.md` | 需求 3.2.2 提取器验收标准 + 完整 SYSTEM_PROMPT；需求 3.2.4 演化日志；§1.7 迁移策略 | 验收标准与接口签名 |
| `specs/tasks/phase1/phase1-task023_memory-extractor-evolution.md` | 9 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `llm-streaming-integration` | AiGatewaySession 非流式 chat() 调用、错误分类与重试策略、Token 计算 | callExtractionLLM() 中的 withRetry + 指数退避；tokenCost 统计 |
| `ai-context-engine` | 记忆系统与上下文引擎交互规范；MEMORY.md 作为 Layer 1 始终加载 | 提取结果的 MEMORY.md 写入后对上下文组装的影响 |
| `typescript-strict-mode` | 联合类型、泛型、类型守卫、禁止 any | 全部类型定义与方法签名 |
| `sqlite-local-storage` | TASK025 向量索引接口预留；similarityIndex 降级链 | MemoryExtractor 构造函数中 similarityIndex 可选注入 |

### 2.3 前置代码依赖（TASK022 产物）

| 模块 | 文件 | 状态 | 复用方式 |
|------|------|------|---------|
| `MemorySection` | `memory/types.ts:3-9` | ✅ 已定义 | 提取器分类、演化日志 section |
| `MemoryEntry` | `memory/types.ts:11-22` | ✅ 已定义 | 合并逻辑、candidateToEntry 转换 |
| `MemoryFileSnapshot` | `memory/types.ts:31-34` | ✅ 已定义 | applyExtractionReport 读写快照 |
| `LogEntry` | `memory/types.ts:43-55` | ✅ 已定义 | ExtractionInput.logs |
| `ExtractionInput` | `memory/types.ts:90-93` | ⚠️ 骨架 | 需扩展 workspaceContext |
| `ExtractionCandidate` | `memory/types.ts:95-101` | ⚠️ 骨架 | 需扩展 reasoning、similarExistingId |
| `ExtractionReport` | `memory/types.ts:103-107` | ⚠️ 骨架 | 需重写为 MemoryEntry[] + durationMs + tokenCost |
| `EvolutionEvent` | `memory/types.ts:143-149` | ⚠️ 骨架 | 需重写为完整可追溯格式 |
| `EvolutionEventType` | `memory/types.ts:133-141` | ⚠️ 骨架 | 需替换为规范定义的 8 种类型 |
| `MemoryFileManager` | `memory/memory-file-manager.ts` | ✅ 532 行 | load()/save() 原子读写 |
| `LogStore` | `memory/log-store.ts` | ✅ 148 行 | countByFilter() 用于 detectKeyEvents |
| `AiGatewayClient` | `ai-gateway-client.ts` | ✅ 201 行 | createSession({ role: 'memory-extractor' }) |
| `AiGatewaySession` | `ai-gateway-client.ts:165-201` | ✅ 已实现 | chat() + close() |
| `MemoryManager` | `memory-manager.ts:580-584` | ⚠️ 空壳 | applyExtractionReport() 待实现 |
| `V2Components` | `memory-manager.ts:71-74` | ⚠️ 缺 evolutionLog | 需扩展注入 EvolutionLog |
| `logger` | `utils/logger.ts` | ✅ 单例 | 结构化日志输出 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK024（检查点/压缩） | CheckpointScheduler 调用 MemoryExtractor.extract()；EvolutionLog.append()；CompressionResult 类型 |
| TASK025（向量检索） | MemoryIndexer 依赖 ExtractionReport 更新索引；similarityIndex 接口注入提取器 |
| TASK026（记忆面板 UI） | UI 展示 EvolutionLog.query() 历史；manual-edit 类型条目 |

### 2.5 npm 依赖

| 包 | 用途 | 风险 |
|----|------|------|
| `yaml` ^2.x | YAML frontmatter 解析（已由 TASK022 引入） | 无新增 |

---

## 三、现有代码盘点与差距分析

### 3.1 types.ts 骨架 vs 规范定义

```typescript
// 现有骨架（types.ts:90-107）
ExtractionInput  → 缺 workspaceContext
ExtractionCandidate → 缺 reasoning、similarExistingId；有 tags 但规范无
ExtractionReport → added 类型是 ExtractionCandidate[]（规范是 MemoryEntry[]）；
                    merged 缺 existing/merged ID 对；discarded 缺 reason；
                    缺 durationMs、tokenCost

// 现有骨架（types.ts:133-149）
EvolutionEventType → 有 'compress'|'checkpoint'|'migrate'，但缺 'manual-edit'|'lock'|'unlock'
EvolutionEvent → 无 id、entryId、section、before/after、rationale；trigger 结构不匹配
```

### 3.2 MemoryManager 空壳

```typescript
// memory-manager.ts:580-584
async applyExtractionReport(_report: ExtractionReport): Promise<void> {
  if (!this.v2Components?.fileManager) {
    throw new Error('v2 not available')
  }
  logger.info('[MemoryManager] applyExtractionReport() stub — TASK023 will implement')
}
```

缺失：EvolutionLog 注入、snapshot 更新逻辑、compressionNeeded 标志返回。

### 3.3 AiGatewaySession 接口映射

| 规范期望 | 实际实现 | 差距 |
|---------|---------|------|
| `session.chat({ model, messages, responseFormat: 'json', temperature })` | `session.chat({ model, messages, temperature, maxTokens?, stream? })` | 无 `responseFormat` 参数——需在 prompt 中显式要求 JSON 输出 |
| `session.close()` | ✅ 已实现（当前为 noop 日志） | 无差距 |

### 3.4 EventBus 缺失

代码库中尚无 `EventBus` 实现。TASK023 的 `detectKeyEvents` 需要 `this.eventBus?.emit('guardrail-repeated', ...)`。**策略**：使用 Node.js `EventEmitter` 创建轻量 `MemoryEventBus`，暂放在 `memory/` 模块内，后续如需全局事件总线再迁移。

---

## 四、类型设计变更

### 4.1 ExtractionInput 扩展

```typescript
export interface ExtractionInput {
  logs: LogEntry[]
  existingMemory: MemoryEntry[]
  workspaceContext: { name: string; description?: string }  // 新增
}
```

### 4.2 ExtractionCandidate 扩展

```typescript
export interface ExtractionCandidate {
  section: MemorySection
  content: string
  confidence: number
  reasoning: string         // 新增：why worth remembering
  sourceLogIds: string[]
  similarExistingId?: string // 新增：suggest merge target
  // tags 移除——规范未定义，合并时从 existing 继承
}
```

### 4.3 ExtractionReport 重写

```typescript
export interface ExtractionReport {
  added: MemoryEntry[]                                      // 从 ExtractionCandidate[] 改为 MemoryEntry[]
  merged: Array<{ existing: string; merged: string }>       // 重写：existing entryId + merged entryId
  discarded: Array<{ candidate: string; reason: string }>   // content 改为 candidate（语义更准确）
  durationMs: number                                        // 新增
  tokenCost: { input: number; output: number }              // 新增
}
```

### 4.4 ExtractorConfig 新增

```typescript
export interface ExtractorConfig {
  extractorModel: string           // 默认 'claude-haiku'
  confidenceThreshold: number      // 默认 0.5
  similarityThreshold: number      // 默认 0.85
  maxNewEntriesPerBatch: number    // 默认 20
  maxRetries: number               // 默认 3
}
```

### 4.5 EvolutionEventType 重写

```typescript
export type EvolutionEventType =
  | 'add'
  | 'update'
  | 'merge'
  | 'archive'
  | 'delete'
  | 'manual-edit'  // 新增
  | 'lock'         // 新增
  | 'unlock'       // 新增
// 移除: 'compress', 'checkpoint', 'migrate'
```

### 4.6 EvolutionEvent 重写

```typescript
export interface EvolutionEvent {
  id: string                              // 新增
  timestamp: string                       // 保留
  type: EvolutionEventType                // 保留（类型更新）
  entryId: string                         // 新增
  section: MemorySection                  // 新增
  before?: Partial<MemoryEntry>           // 新增
  after?: Partial<MemoryEntry>            // 新增
  trigger: {                              // 重写
    source: 'checkpoint' | 'manual' | 'compression' | 'migration'
    checkpointId?: string
    userId?: string
  }
  rationale?: string                      // 新增
}
```

### 4.7 向后兼容处理

TASK024 骨架引用的 `EvolutionEvent` 和 `ExtractionReport` 结构将变更。因 TASK024 尚未实现，直接重写无破坏风险。`CheckpointRecord` 和 `CompressionResult` 保持不变。

---

## 五、分步实施计划

### 阶段 A：类型层（Step 1-2） — 预计 0.5 天

#### A1：扩展 types.ts 提取相关类型

**文件：** `sibylla-desktop/src/main/services/memory/types.ts`

**操作：**
1. 在 `ExtractionInput` 中新增 `workspaceContext` 字段
2. 在 `ExtractionCandidate` 中新增 `reasoning`、`similarExistingId`，移除 `tags`
3. 重写 `ExtractionReport`：`added` 改为 `MemoryEntry[]`，`merged` 改为 `{ existing: string; merged: string }[]`，`discarded` 保留但字段名调整为 `candidate`，新增 `durationMs` 和 `tokenCost`
4. 新增 `ExtractorConfig` 接口（5 个字段 + 默认值常量 `DEFAULT_EXTRACTOR_CONFIG`）

**验证：** `npm run typecheck` 通过

#### A2：重写 types.ts 演化相关类型

**文件：** `sibylla-desktop/src/main/services/memory/types.ts`

**操作：**
1. 替换 `EvolutionEventType` 为规范定义的 8 种值
2. 重写 `EvolutionEvent` 接口：新增 `id`/`entryId`/`section`/`before`/`after`/`rationale`，重写 `trigger` 结构
3. 新增 `CHANGELOG_HEADER` 常量（Markdown 头部模板）
4. 新增 `SECTION_ID_PREFIX` 映射常量：`{ user_preference: 'pref', technical_decision: 'dec', ... }`

**验证：** `npm run typecheck` 通过

---

### 阶段 B：MemoryExtractor（Step 3-4） — 预计 1.5 天

#### B1：创建 memory-extractor.ts 骨架

**文件：** `sibylla-desktop/src/main/services/memory/memory-extractor.ts`（新建）

**构造函数设计：**

```typescript
export class MemoryExtractor {
  private readonly SYSTEM_PROMPT: string  // 需求 3.2.2 完整 prompt
  private readonly config: ExtractorConfig

  constructor(
    private readonly aiGateway: AiGatewayClient,
    private readonly similarityIndex: SimilarityIndexProvider | null,  // 可选注入
    config?: Partial<ExtractorConfig>,
    private readonly logger: Logger = logger,
  ) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config }
  }
}
```

**SimilarityIndexProvider 接口**（为 TASK025 预留）：

```typescript
export interface SimilarityIndexProvider {
  isAvailable(): boolean
  embed(text: string): Promise<number[]>
  getOrComputeEmbedding(entry: MemoryEntry): Promise<number[]>
}
```

此接口不依赖 TASK025 实现——MemoryExtractor 构造时 `similarityIndex` 可传 `null`，降级使用文本相似度。

#### B2：实现 extract() 主方法

**5 步流水线：**

```
extract(input: ExtractionInput): Promise<ExtractionReport>
├── Step 1: callExtractionLLM(input) → candidates[]
├── Step 2: filterByConfidence(candidates) → highConfidence[] + report.discarded
├── Step 3: checkOverExtraction(highConfidence) → warn if > config.maxNewEntriesPerBatch
├── Step 4: for each candidate:
│   ├── findSimilar(candidate, existingMemory)
│   ├── similar → mergeEntries(existing, candidate) → report.merged
│   └── not similar → candidateToEntry(candidate) → report.added
└── Step 5: compute durationMs + tokenCost → return report
```

**关键细节：**
- `startTime = Date.now()` 在方法入口记录
- `tokenCost` 从 `AiGatewayChatResponse.usage` 累加
- 整个 extract() 用 try/catch 包裹，失败时 `logger.error('memory.extract.failed')` 后 throw
- 不阻塞主线程：调用方（TASK024 的 CheckpointScheduler）负责在 async queue 或 worker 中调度

#### B3：实现 callExtractionLLM()

```typescript
private async callExtractionLLM(input: ExtractionInput): Promise<ExtractionCandidate[]>
```

1. `const session = this.aiGateway.createSession({ role: 'memory-extractor' })`
2. `const prompt = this.buildPrompt(input)`
3. 使用 `withRetry()` 包装 `session.chat()`
4. 请求参数：`{ model: this.config.extractorModel, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], temperature: 0.2 }`
5. **JSON 解析**：因 `AiGatewayChatRequest` 无 `responseFormat` 字段，在 SYSTEM_PROMPT 中明确要求 `"Output JSON only"` 并用 `JSON.parse(response.content)` 解析
6. 解析后验证 `candidates` 数组存在，否则抛出 `Error('Invalid LLM response: missing candidates array')`
7. `finally { session.close() }`
8. 累加 `tokenCost.input += response.usage.inputTokens`、`tokenCost.output += response.usage.outputTokens`

#### B4：实现 buildPrompt()

```typescript
private buildPrompt(input: ExtractionInput): string
```

格式化规则：
- 日志摘要：每条 ≤ 2 行，包含 id + timestamp + summary
- 现有记忆列表：id + section + content 前 80 字符
- workspaceContext 包含 name + description
- 结尾明确要求 JSON 格式输出

#### B5：实现 withRetry()

```typescript
private async withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T>
```

- 延迟数组：`[1000, 5000, 30000]`
- `for (let attempt = 0; attempt < maxAttempts; attempt++)`
- 失败时 `await this.sleep(delays[attempt])`（仅 attempt < maxAttempts - 1 时）
- 最后一次失败抛出 `lastErr`
- 每次重试记录 `logger.warn('memory.extract.retry', { attempt, maxAttempts, err })`

#### B6：实现 findSimilar()

```typescript
private async findSimilar(
  candidate: ExtractionCandidate,
  existing: MemoryEntry[],
): Promise<MemoryEntry | null>
```

降级链：
1. `if (this.similarityIndex?.isAvailable())` → 向量余弦相似度，阈值 `config.similarityThreshold`（0.85）
2. `else` → `textSimilarity()` 文本 Jaccard 相似度，阈值降低至 **0.7**（文本精度较低）
3. 仅在同 section 内比较：`existing.filter(e => e.section === candidate.section)`

#### B7：实现文本相似度降级方案

```typescript
private textSimilarity(a: string, b: string): number
```

- 分词：按空格 + CJK 字符（`[\u4e00-\u9fff]`）分割
- Jaccard 系数：`|A∩B| / |A∪B|`
- 返回 0-1

#### B8：实现 cosineSimilarity()

```typescript
private cosineSimilarity(a: number[], b: number[]): number
```

- 标准余弦相似度公式
- 边界处理：零向量返回 0

#### B9：实现 mergeEntries()

```typescript
private mergeEntries(existing: MemoryEntry, candidate: ExtractionCandidate): MemoryEntry
```

- `if (existing.locked)` → `logger.info('memory.merge.skipped.locked')`，返回 existing 不变
- 新 confidence = `(existing.confidence × existing.hits + candidate.confidence) / (existing.hits + 1)`
- 新 hits = `existing.hits + 1`
- 新 sourceLogIds = `[...new Set([...existing.sourceLogIds, ...candidate.sourceLogIds])]`
- 新 content = `candidate.confidence > existing.confidence + 0.15 ? candidate.content : existing.content`
- 新 updatedAt = `new Date().toISOString()`
- 其他字段保留 existing 值

#### B10：实现 candidateToEntry()

```typescript
private candidateToEntry(candidate: ExtractionCandidate): MemoryEntry
```

- ID 格式：`${sectionPrefix}-${Date.now()}-${random(4)}`
- section 前缀映射：`{ user_preference: 'pref', technical_decision: 'dec', common_issue: 'iss', project_convention: 'conv', risk_note: 'risk', glossary: 'glos' }`
- hits = 0、locked = false、tags = []
- createdAt = updatedAt = `new Date().toISOString()`

---

### 阶段 C：EvolutionLog（Step 5） — 预计 1 天

#### C1：创建 evolution-log.ts

**文件：** `sibylla-desktop/src/main/services/memory/evolution-log.ts`（新建）

**构造函数设计：**

```typescript
export class EvolutionLog {
  private readonly MAX_ENTRIES_PER_FILE = 5000

  constructor(
    private readonly workspaceRoot: string,
    private readonly fileManager: FileManager,  // 原子写入
    private readonly logger: Logger = logger,
  ) {}
}
```

**FileManager 依赖说明**：现有 `MemoryFileManager` 使用 `fs` 直接操作。EvolutionLog 需要类似的文件操作能力。**策略**：注入 `workspaceRoot`，内部使用 `fs`（与 `LogStore` 保持一致），`appendFile` 用于追加写入，`readFile` 用于查询。

#### C2：实现 append()

```typescript
async append(event: EvolutionEvent): Promise<void>
```

1. `const logPath = await this.getCurrentLogPath()`
2. `const formatted = this.formatEvent(event)`
3. `await fs.appendFile(logPath, formatted + '\n', 'utf-8')`
4. 写入失败：`logger.error('memory.evolution.append.failed', { err })`——**不抛出异常**（非阻塞）

#### C3：实现 getCurrentLogPath()

```typescript
private async getCurrentLogPath(): Promise<string>
```

1. 路径 = `path.join(this.workspaceRoot, '.sibylla/memory/CHANGELOG.md')`
2. 不存在 → 创建并写入 `CHANGELOG_HEADER`
3. 存在 → 统计 `## ` 标题行数（调用 `countEntries()`）
4. 超 5000 → 重命名为 `CHANGELOG-{当前年月}.md`（如 `CHANGELOG-2026-04.md`），创建新的 `CHANGELOG.md`
5. 返回路径

**轮转重命名逻辑**：
- 检查目标轮转文件是否已存在（同月可能已轮转过）
- 若存在，追加到现有轮转文件尾部（不覆盖）
- 创建新 CHANGELOG.md 并写入 header

#### C4：实现 query()

```typescript
async query(filter: {
  entryId?: string
  type?: EvolutionEventType
  since?: string
  limit?: number
}): Promise<EvolutionEvent[]>
```

1. 收集所有 CHANGELOG 文件路径：当前 + 历史轮转（`CHANGELOG-*.md` glob）
2. 按文件名倒序读取（最新文件优先）
3. 解析每个 `## ` 块为 `EvolutionEvent`（调用 `parseEvent()`）
4. 应用过滤条件：entryId、type、since
5. 按时间倒序排列
6. 应用 limit
7. 返回结果

#### C5：实现 formatEvent()

```typescript
private formatEvent(event: EvolutionEvent): string
```

输出格式（参照规范 §3.2.4）：

```markdown
## {timestamp} — {type} — {entryId}

- **Section:** {section}
- **Trigger:** {trigger.source}({trigger.checkpointId})
- **Rationale:** {rationale}

### Before
```json
{before JSON}
```

### After
```json
{after JSON}
```

---
```

- before/after 仅在存在时输出
- rationale 仅在存在时输出

#### C6：实现 parseEvent()

```typescript
private parseEvent(block: string): EvolutionEvent | null
```

- 从 `## ` 标题行提取 timestamp、type、entryId
- 从 `- **Section:**` 行提取 section
- 从 `- **Trigger:**` 行提取 trigger
- 从 `- **Rationale:**` 行提取 rationale
- 从 `### Before/After` 代码块提取 JSON 并解析
- malformed 行：`logger.warn('memory.evolution.parse.malformed')`，返回 `null`

#### C7：实现 countEntries()

```typescript
private async countEntries(filePath: string): Promise<number>
```

- 读取文件内容
- 统计 `## ` 开头的行数
- 读取失败返回 0

---

### 阶段 D：applyExtractionReport + detectKeyEvents（Step 6-7） — 预计 0.5 天

#### D1：扩展 V2Components 接口

**文件：** `sibylla-desktop/src/main/services/memory-manager.ts`

在 `V2Components` 中新增：

```typescript
export interface V2Components {
  fileManager: MemoryFileManager
  logStore: LogStore
  evolutionLog?: EvolutionLog  // 新增：可选注入
}
```

#### D2：实现 applyExtractionReport()

**文件：** `sibylla-desktop/src/main/services/memory-manager.ts:580-584`

替换现有空壳：

```typescript
async applyExtractionReport(report: ExtractionReport): Promise<{ compressionNeeded: boolean }>
```

**逻辑：**
1. `const snapshot = await this.v2Components.fileManager.load()`
2. 遍历 `report.added`：
   - 追加到 `snapshot.entries`
   - `this.v2Components.evolutionLog?.append({ type: 'add', entryId, section, after, trigger: { source: 'checkpoint' }, ... })`
3. 遍历 `report.merged`：
   - 在 `snapshot.entries` 中找到 `existing` ID 对应条目，替换为合并后的条目
   - `this.v2Components.evolutionLog?.append({ type: 'merge', entryId, section, before, after, trigger: { source: 'checkpoint' }, ... })`
4. 遍历 `report.discarded`：
   - 仅 `this.v2Components.evolutionLog?.append({ type: 'delete', entryId: 'discarded', section, rationale: reason, trigger: { source: 'checkpoint' }, ... })`
   - 不修改 MEMORY.md
5. 更新 `snapshot.metadata.totalTokens`、`entryCount`、`lastCheckpoint`
6. `await this.v2Components.fileManager.save(snapshot)`
7. `return { compressionNeeded: snapshot.metadata.totalTokens > 12000 }`

**注意**：返回值增加 `compressionNeeded` 标志，供 TASK024 CheckpointScheduler 判断是否需触发压缩。这比 emit 事件更简单、更可测试。

#### D3：实现 detectKeyEvents()

**文件：** `sibylla-desktop/src/main/services/memory-manager.ts`

新增私有方法：

```typescript
private detectKeyEvents(event: HarnessTraceEvent): void
```

**逻辑：**
1. 仅处理 `event.traceType === 'guardrail_triggered'` 的 HarnessTraceEvent
2. 提取 `event.details.ruleId`（`string` 类型）
3. 调用 `this.v2Components?.logStore.countByFilter({ type: 'harness_trace', traceType: 'guardrail_triggered', since: 24h前ISO, details: { ruleId } })`
4. 若 `count >= 5` → `this.eventBus?.emit('guardrail-repeated', { ruleId, count })`

#### D4：在 appendHarnessTraceV2() 中集成 detectKeyEvents

在 `appendHarnessTraceV2()` 方法末尾调用：

```typescript
this.detectKeyEvents(event)
```

不阻塞——detectKeyEvents 内部的 `countByFilter` 是异步的，但不 await（即 fire-and-forget，日志记录不计入 HarnessTrace 关键路径）。如需 await，需确认不影响 Harness 执行延迟。**策略**：使用 `void this.detectKeyEvents(event)` 明确标注非阻塞。

#### D5：创建 MemoryEventBus

**文件：** `sibylla-desktop/src/main/services/memory/memory-event-bus.ts`（新建）

```typescript
import { EventEmitter } from 'events'

export class MemoryEventBus extends EventEmitter {
  // Typed emit helpers
  emitGuardrailRepeated(ruleId: string, count: number): void {
    this.emit('guardrail-repeated', { ruleId, count })
  }
}
```

在 `MemoryManager` 中注入为可选属性：

```typescript
private eventBus?: MemoryEventBus

setEventBus(bus: MemoryEventBus): void {
  this.eventBus = bus
}
```

---

### 阶段 E：桶导出更新 — 预计 0.1 天

#### E1：更新 memory/index.ts

**文件：** `sibylla-desktop/src/main/services/memory/index.ts`

新增导出：
- `MemoryExtractor`
- `EvolutionLog`
- `MemoryEventBus`
- `SimilarityIndexProvider`
- `ExtractorConfig`
- `DEFAULT_EXTRACTOR_CONFIG`
- 更新的类型：`ExtractionInput`、`ExtractionCandidate`、`ExtractionReport`、`EvolutionEventType`、`EvolutionEvent`

---

### 阶段 F：单元测试（Step 8） — 预计 1.5 天

#### F1：memory-extractor.test.ts

**文件：** `sibylla-desktop/tests/memory/memory-extractor.test.ts`（新建）

**测试用例：**

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | LLM 提取流程 | mock AiGatewayClient.createSession() 返回预设 candidates；验证 extract() 返回正确 ExtractionReport（added/merged/discarded 计数） |
| 2 | 置信度过滤 | confidence=0.4 的候选进入 discarded；confidence=0.6 的候选进入 added/merged |
| 3 | 相似度合并 | mock similarityIndex 返回高相似度；验证合并后 confidence 是加权平均；验证 sourceLogIds 去重合并 |
| 4 | locked 条目跳过合并 | existing.locked=true 时 mergeEntries 返回原条目不变；merged 列表不包含该条目 |
| 5 | 过度提取警告 | 高置信度候选 > 20 时 logger.warn 被调用 |
| 6 | LLM 失败重试 | mock 前两次 chat() 失败、第三次成功；验证重试次数和最终成功 |
| 7 | 文本相似度降级 | similarityIndex=null 时 findSimilar() 使用文本 Jaccard 相似度 |

**Mock 策略：**
- `AiGatewayClient`：创建 mock 对象，`createSession()` 返回 mock session
- `AiGatewaySession`：mock `chat()` 返回预设 `AiGatewayChatResponse`
- `SimilarityIndexProvider`：mock `isAvailable()`、`embed()`、`getOrComputeEmbedding()`

#### F2：evolution-log.test.ts

**文件：** `sibylla-desktop/tests/memory/evolution-log.test.ts`（新建）

**测试用例：**

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | append 正确写入 | CHANGELOG.md 存在且包含格式化的 Markdown 事件记录 |
| 2 | append 格式化可读 | formatEvent() 输出包含 timestamp、type、entryId、section、trigger、before/after |
| 3 | 超 5000 条轮转 | 注入 5001 条后 CHANGELOG.md 被重命名为 CHANGELOG-YYYY-MM.md；新 CHANGELOG.md 有 header |
| 4 | query 按 entryId/type/since 过滤 | 返回符合条件的 EvolutionEvent[]；按时间倒序 |
| 5 | malformed CHANGELOG 继续运行 | parseEvent() 对格式错误的块返回 null 并记录 warning；query() 跳过这些块 |
| 6 | 写入失败不抛异常 | mock fs.appendFile 抛出错误；append() 不 throw |

**测试隔离：** 使用 `os.tmpdir()` 创建临时工作目录，测试后清理。

#### F3：apply-report.test.ts

**文件：** `sibylla-desktop/tests/memory/apply-report.test.ts`（新建）

**测试用例：**

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | 正确更新 snapshot | applyExtractionReport 后 MemoryFileManager.load() 返回包含新/合并条目的 snapshot |
| 2 | 新增条目触发 add | EvolutionLog.append 被调用且 type='add' |
| 3 | 合并条目触发 merge | EvolutionLog.append 被调用且 type='merge'，包含 before/after |
| 4 | 丢弃条目仅触发 delete | EvolutionLog.append 被调用且 type='delete'；MemoryFileManager 不写入丢弃条目 |
| 5 | totalTokens 超阈值标记压缩 | snapshot.metadata.totalTokens > 12000 时返回 compressionNeeded=true |

---

### 阶段 G：集成验证（Step 9） — 预计 0.5 天

#### G1：TypeScript 类型检查

```bash
npm run typecheck
```

确保所有新增/修改文件类型无误。

#### G2：Lint 检查

```bash
npm run lint
```

确保代码规范。

#### G3：运行测试

```bash
npm run test
```

确保所有测试通过（包括 TASK022 已有测试不被破坏）。

#### G4：手动验证提取链路

1. 准备测试日志（JSONL 格式，10 条）
2. 配置 AiGatewayClient 指向 mock server 或使用本地 fallback
3. 调用 `MemoryExtractor.extract(input)` → 确认 ExtractionReport
4. 调用 `MemoryManager.applyExtractionReport(report)` → 确认 MEMORY.md 更新
5. 确认 CHANGELOG.md 记录正确
6. 确认 EvolutionLog.query() 返回预期事件

---

## 六、验收标准追踪

### 精选记忆提取器

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 200 条日志批次提取 < 30 秒 | B2 extract() + B3 callExtractionLLM() | 性能测试待集成验证 |
| 2 | 置信度 < 0.5 自动丢弃 | B2 Step 2 | F1-2 |
| 3 | 相似度 > 0.85 自动合并 | B6 findSimilar() | F1-3 |
| 4 | 合并时加权平均 confidence | B9 mergeEntries() | F1-3 |
| 5 | locked 条目跳过合并 | B9 mergeEntries() | F1-4 |
| 6 | LLM 失败重试 3 次指数退避 | B5 withRetry() | F1-6 |
| 7 | 单批次 > 20 条标记过度提取 | B2 Step 3 | F1-5 |
| 8 | 返回 ExtractionReport 完整计数 | B2 Step 5 | F1-1 |
| 9 | 不阻塞主线程 | async 方法 + 调用方负责调度 | 架构级保障 |

### 演化日志

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | MEMORY.md 被提取器修改后自动追加 | D2 applyExtractionReport() | F3-2/3/4 |
| 2 | 用户手动编辑后 file watcher 追加 | **不包含**——file watcher 属 TASK026 UI 层 | — |
| 3 | 超 5000 条轮转 | C3 getCurrentLogPath() | F2-3 |
| 4 | malformed 时继续运行 | C6 parseEvent() | F2-5 |
| 5 | 按 entryId/type/since 过滤 | C4 query() | F2-4 |

### applyExtractionReport

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 新增条目写入 + 触发 EvolutionLog | D2 Step 2 | F3-1/2 |
| 2 | 合并条目更新 + 触发 EvolutionLog | D2 Step 3 | F3-1/3 |
| 3 | 丢弃条目仅记录 EvolutionLog | D2 Step 4 | F3-4 |
| 4 | compressionNeeded 标志 | D2 Step 7 | F3-5 |

### detectKeyEvents

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 同一规则 24h 内 5+ 次触发 guardrail-repeated | D3 detectKeyEvents() | 待集成测试 |
| 2 | 不阻塞 Harness 执行 | D4 void 调用 | 架构级保障 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| LLM 返回非 JSON 格式 | 提取失败 | SYSTEM_PROMPT 强调 JSON only；withRetry 3 次重试；JSON.parse 失败抛出清晰错误 |
| 文本相似度降级精度不足 | 误合并不相关记忆 | 降级阈值从 0.85 降至 0.7；合并时内容保护（confidence 差 < 0.15 不替换） |
| EvolutionLog 写入失败 | 演化追溯中断 | append() 不抛异常；logger.error 记录；不影响 MEMORY.md 主路径 |
| V2Components 类型变更破坏 TASK024 骨架 | 编译错误 | CheckpointRecord/CompressionResult 不变更；EvolutionEvent/ExtractionReport 变更已确认无下游消费者 |
| AiGatewaySession 无 responseFormat 参数 | LLM 可能输出非 JSON | prompt 工程解决；长期建议 TASK024 后为 AiGatewayChatRequest 新增 responseFormat 字段 |

---

## 八、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A2 | types.ts 全部类型扩展完成 |
| Day 1 下午 - Day 2 | B1-B10 | memory-extractor.ts 完整实现 |
| Day 3 | C1-C7 | evolution-log.ts 完整实现 |
| Day 4 上午 | D1-D5 + E1 | memory-manager.ts 填充 + index.ts 更新 |
| Day 4 下午 - Day 5 上午 | F1-F3 | 3 个测试文件全部通过 |
| Day 5 下午 | G1-G4 | 集成验证通过 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-20
**维护者**: Sibylla 架构团队
