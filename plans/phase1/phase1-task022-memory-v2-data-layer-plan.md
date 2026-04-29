# PHASE1-TASK022: MEMORY.md v2 数据层与日志存储 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task022_memory-v2-data-layer.md](../specs/tasks/phase1/phase1-task022_memory-v2-data-layer.md)
> 创建日期：2026-04-20
> 最后更新：2026-04-20

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK022 |
| **任务标题** | MEMORY.md v2 数据层与日志存储 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | ✅ MemoryManager v1、✅ AiGatewayClient、✅ FileManager 原子写入、✅ TASK016 |

### 1.1 目标

构建记忆系统 v2 的数据基础层——定义 v2 全部共享类型、实现 MEMORY.md v2 格式读写与 v1→v2 自动迁移、实现 JSONL 日志存储（LogStore）、扩展 MemoryManager 为 v2 门面。这是 TASK023/024/025/026 的地基。

### 1.2 核心变更

| 维度 | v1 现状 | v2 改造 |
|------|---------|---------|
| MEMORY.md 路径 | `workspaceRoot/MEMORY.md` | 迁移至 `.sibylla/memory/MEMORY.md` |
| MEMORY.md 格式 | 纯 Markdown | YAML frontmatter + `<!-- @entry -->` 结构化 |
| Section 命名 | 自由中文标题 | 6 个固定 `MemorySection` 枚举值 |
| 日志格式 | `.sibylla/memory/daily/YYYY-MM-DD.md` | 新增 JSONL `.sibylla/memory/logs/YYYY-MM.jsonl` |
| IPC 通道 | 6 个 v1 通道 | v1 保留 + 新增 16 个 v2 通道 |

### 1.3 范围边界

**包含：** types.ts、MemoryFileManager、LogStore、MemoryManager 门面扩展、AiGatewaySession、shared/types.ts 扩展、单元测试

**不包含：** MemoryExtractor(TASK023)、CheckpointScheduler/MemoryCompressor(TASK024)、MemoryIndexer(TASK025)、MemoryPanel UI(TASK026)

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | §四 TS 严格模式禁止 any；§五 记忆即演化、日志 append-only；§六 原子写入 | 全局约束 |
| `specs/design/architecture.md` | §3.2 invoke/handle IPC 模式 | IPC 设计 |
| `specs/design/data-and-api.md` | §1.1 Workspace 目录结构；§5 IPC 通信接口 | 目录结构、IPC |
| `specs/design/memory-system-design.md` | 三层存储；MEMORY.md 8-12K tokens；日志 append-only | 架构参考 |
| `specs/requirements/phase1/sprint3.2-memory.md` | 需求 3.2.1、§1.7 迁移策略、§1.7.3 Section 映射表 | 验收标准 |
| `specs/tasks/phase1/phase1-task022_memory-v2-data-layer.md` | 10 步执行路径、验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 |
|-------|---------|
| `typescript-strict-mode` | MemorySection 联合类型、类型守卫、禁止 any 替代方案 |
| `ai-context-engine` | 记忆系统与上下文引擎集成接口；MEMORY.md Layer 1 交互规范 |
| `electron-ipc-patterns` | v2 IPC 通道规范、IPCChannelMap 类型映射、Preload bridge |
| `sqlite-local-storage` | TASK025 向量索引前置接口预留（本任务仅定义类型骨架） |

### 2.3 前置代码依赖

| 模块 | 状态 | 复用方式 |
|------|------|---------|
| MemoryManager v1 | ✅ 95% | 扩展为 v2 门面 |
| AiGatewayClient | ✅ 70% | 新增 createSession() + 非流式 chat() |
| FileManager | ✅ 100% | atomicWrite() 用于 MEMORY.md |
| IPC_CHANNELS / IPCChannelMap | ⚠️ 需扩展 | 新增 16 个 v2 通道 |
| Preload API | ⚠️ 需扩展 | 新增 memory v2 命名空间 |
| MemoryHandler | ⚠️ 需扩展 | 新增 v2 handler 方法 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK023（提取器） | types.ts + LogStore + getAllEntries() + AiGatewaySession |
| TASK024（检查点/压缩） | LogStore + getLogsSince() + CompressionResult/CheckpointRecord 类型 |
| TASK025（向量索引） | MemoryEntry + HybridSearchResult + SearchOptions 类型 |
| TASK026（记忆面板 UI） | MemoryManager v2 方法 + IPC 类型 + MemoryV2StatsResponse |

### 2.5 npm 依赖

| 包 | 用途 | 风险 |
|----|------|------|
| `yaml` ^2.x | YAML frontmatter 解析/序列化（~80KB，纯 JS） | 低 |

---

## 三、现有代码盘点与差距分析

### 3.1 当前 v1 数据流

```
AIHandler
  ├── appendLog(entry)        → .sibylla/memory/daily/YYYY-MM-DD.md (Markdown)
  ├── getMemorySnapshot()     → workspaceRoot/MEMORY.md (纯 Markdown)
  ├── updateMemory(updates)   → 直接覆写 MEMORY.md
  └── flushIfNeeded(...)      → 截断低分行
```

### 3.2 目标 v2 数据流

```
MemoryManager v2 门面
  ├── appendLog(entry)         → 双写 v1 Markdown + v2 JSONL
  ├── getMemorySnapshot()      → MemoryFileManager.load() → 映射为 v1 格式
  ├── getLogsSince(timestamp)  → LogStore.getSince()      [新增]
  ├── getAllEntries()          → MemoryFileManager.load().entries [新增]
  ├── applyExtractionReport()  → MemoryFileManager + EvolutionLog [空壳]
  ├── getWorkspaceContext()    → config.json { name, description? } [新增]
  ├── appendHarnessTrace()     → LogStore.append [空壳]
  ├── compress()               → MemoryCompressor [空壳]
  ├── getAllArchivedEntries()  → ARCHIVE.md [空壳]
  └── search()                 → MemoryIndexer [空壳]
```

### 3.3 差距矩阵

| 能力 | v1 现状 | 本任务产出 |
|------|---------|-----------|
| MEMORY.md 结构化 | ❌ 纯 Markdown | MemoryFileManager：YAML + `<!-- @entry -->` |
| MEMORY.md 路径 | workspaceRoot/ | 迁移至 `.sibylla/memory/` |
| v1→v2 迁移 | ❌ | migrateFromV1() + 备份 |
| Section 枚举 | ❌ 自由中文标题 | MemorySection 联合类型 + V1_SECTION_MAP |
| JSONL 日志 | ❌ | LogStore：append/getSince/countByFilter |
| 非流式 LLM | ❌ | AiGatewaySession 接口 |
| v2 IPC 通道 | ❌ 仅 6 个 v1 | 16 个 v2 通道 + 类型 |
| Token 估算 | ❌ 字符截断 | estimateTokens() CJK/ASCII 混合估算 |

---

## 四、类型系统设计

### 4.1 v2 核心类型（`src/main/services/memory/types.ts`）

**MemorySection 联合类型：**
`'user_preference' | 'technical_decision' | 'common_issue' | 'project_convention' | 'risk_note' | 'glossary'`

**MemoryEntry 接口字段：** id, section, content, confidence(0-1), hits, createdAt, updatedAt, sourceLogIds, locked, tags

**MemoryFileMetadata：** version=2, lastCheckpoint, totalTokens, entryCount

**MemoryFileSnapshot：** metadata + entries[]

**LogEntry 接口字段：** id(`log-YYYYMMDD-NNN`), type(MemoryLogType | 'harness_trace'), timestamp, sessionId, summary, details?, tags?, relatedFiles?, operator?, traceType?, severity?

**HarnessTraceType 联合类型：** `'guardrail_triggered' | 'sensor_signal' | 'evaluator_verdict' | 'mode_degraded' | 'task_state_change'`

**HarnessTraceEvent：** id, traceType, timestamp, sessionId, taskId?, details, severity

**V1_SECTION_MAP 常量：**
```typescript
'项目概览'→project_convention, '核心决策'→technical_decision,
'当前焦点'→project_convention, '用户偏好'→user_preference,
'技术决策'→technical_decision, '常见问题'→common_issue,
'项目约定'→project_convention, '风险提示'→risk_note,
'关键术语'→glossary
// 未匹配 → project_convention
```

### 4.2 后续任务类型骨架（同文件）

| 类型 | 使用任务 | 关键字段 |
|------|---------|---------|
| ExtractionInput/Candidate/Report | TASK023 | logs, existingMemory, candidates, added/merged/discarded |
| CheckpointTrigger/CheckpointRecord | TASK024 | trigger(timer/interaction_count/manual/key_event), status |
| CompressionResult | TASK024 | discarded, merged, archived, beforeTokens, afterTokens |
| EvolutionEventType/EvolutionEvent | TASK024 | type(add/update/merge/archive/delete/...), trigger.source |
| HybridSearchResult/SearchOptions | TASK025 | score, source(memory/archive), weights, sections |

### 4.3 shared/types.ts 扩展

**新增 16 个 v2 IPC_CHANNELS 常量：**
`memory:listEntries`, `memory:listArchived`, `memory:search`, `memory:getEntry`, `memory:getStats`, `memory:updateEntry`, `memory:deleteEntry`, `memory:lockEntry`, `memory:triggerCheckpoint`, `memory:triggerCompression`, `memory:undoLastCompression`, `memory:getEvolutionHistory`, `memory:rebuildIndex`, `memory:getIndexHealth`, `memory:getConfig`, `memory:updateConfig`

**新增共享类型：**
- `MemoryV2StatsResponse`：totalTokens, entryCount, lastCheckpoint, sections(Record<MemorySection, number>)
- `MemorySearchResult`：id, section, content, confidence, score, source
- `MemoryConfig`：checkpointInterval, interactionThreshold, extractorModel, searchWeights, compressionThreshold, embeddingProvider
- `ContextLayerType`：`'always' | 'manual' | 'skill' | 'memory'`

**v1 类型标记 @deprecated：** MemorySnapshotResponse, MemoryUpdateItem, DailyLogEntry, RagSearchHit

**IPCChannelMap 扩展：** 16 个新条目，params/return 类型与共享类型一致

---

## 五、MemoryFileManager 实现

**文件：** `src/main/services/memory/memory-file-manager.ts`

### 5.1 构造函数

注入：workspaceRoot、FileManager、Logger

### 5.2 核心方法

| 方法 | 职责 |
|------|------|
| `memoryPath()` | 返回 `.sibylla/memory/MEMORY.md` |
| `v1MemoryPath()` | 返回 `workspaceRoot/MEMORY.md` |
| `load()` | 加载+解析 MEMORY.md，含自动迁移检测 |
| `save(snapshot)` | 序列化+原子写入（FileManager.atomicWrite） |
| `parseMarkdown(raw)` | 解析 YAML frontmatter + entries |
| `parseEntries(body)` | 按 section 分节 + 解析 `<!-- @entry -->` 元数据 |
| `serialize(snapshot)` | 生成 v2 格式 Markdown |
| `migrateFromV1(raw)` | v1→v2 迁移 |
| `createEmpty()` | 返回 version=2 空 snapshot |
| `estimateTokens(text)` | CJK/ASCII 混合估算 |

### 5.3 load() 流程

```
.sibylla/memory/MEMORY.md 存在？
├── Yes → parseMarkdown → version=2? → return / migrateFromV1
└── No → workspaceRoot/MEMORY.md 存在？
    ├── Yes → migrateFromV1
    └── No → createEmpty
```

### 5.4 关键正则

- YAML frontmatter: `/^---\n([\s\S]*?)\n---\n([\s\S]*)$/`
- Section 分割: `/^## (.+)$/gm`
- Entry 元数据: `/<!-- @entry ([^>]+) -->/`
- Source 引用: `/<!-- source: (.+?) -->/`
- 元数据键值对: `/(\w+)=([\w.-]+)/g`

### 5.5 容错策略

| malformed 情况 | 处理 |
|---------------|------|
| 缺少 confidence | 默认 0.5 + warning |
| 无效日期 | 使用当前时间 + warning |
| 整行格式错误 | 跳过 + warning |
| 缺少 id | 自动生成 `entry-{section}-{index}` |
| YAML 解析异常 | v1 纯文本模式 + 标记待迁移 |
| load() 失败 | 返回空 snapshot，不崩溃 |

### 5.6 排序算法

```typescript
score = confidence × Math.log(hits + 1)  // 降序
// 锁定条目始终排在 section 最前
```

### 5.7 migrateFromV1() 步骤

1. 按 `## ` 标题分节 → V1_SECTION_MAP 映射（未匹配→project_convention）
2. section 内按 `\n\n+` 分割为条目
3. 每条目：id=`migrated-NNN`, confidence=0.7, hits=0, locked=false
4. estimateTokens(raw) 估算 totalTokens
5. save(snapshot) 写入 `.sibylla/memory/MEMORY.md`
6. 旧文件重命名为 `MEMORY.v1.bak.md`
7. 日志 `memory.migrate.v1.completed`

### 5.8 estimateTokens() 算法

CJK 字符数/2 + 非 CJK 字符数/4，向上取整。

---

## 六、LogStore 实现

**文件：** `src/main/services/memory/log-store.ts`

### 6.1 构造函数

注入：workspaceRoot、Logger

### 6.2 核心方法

| 方法 | 职责 |
|------|------|
| `logsDir()` | 返回 `.sibylla/memory/logs/` |
| `append(entry)` | 追加写入 `YYYY-MM.jsonl` |
| `getSince(timestamp)` | 查询指定时间后的日志 |
| `countByFilter(filter)` | 按 type/traceType/since/details 过滤计数 |

### 6.3 关键设计决策

- **append 失败不抛异常**：日志是辅助数据，MEMORY.md 才是核心（原子写入保证安全）
- **文件按月分割**：`YYYY-MM.jsonl`，单文件通常 < 1MB
- **getSince 按文件名排序**：自然按月排序，可跳过早于 since 的月份文件
- **malformed 行跳过**：JSON.parse 失败时记录 warning，继续处理后续行

### 6.4 countByFilter 过滤

- `type`：精确匹配 entry.type
- `traceType`：精确匹配 entry.traceType
- `since`：entry.timestamp >= since
- `details`：检查 entry.details 包含指定 key-value

---

## 七、AiGatewaySession 接口

**文件：** `src/main/services/ai-gateway-client.ts`（扩展）

### 7.1 接口

```typescript
export interface AiGatewaySession {
  chat(request: Omit<AiGatewayChatRequest, 'stream'>): Promise<AiGatewayChatResponse>
  close(): void
}
```

### 7.2 实现

- `AiGatewaySessionImpl`：持有 AiGatewayClient 引用 + role 字符串
- `chat()` 调用 `client.chat({ ...request, stream: false })`
- `close()` 执行 usage 日志记录

### 7.3 AiGatewayClient 新增

- `createSession(options: { role: string })`：返回 AiGatewaySession 实例
- 非流式 `chat()`：当 stream=false 时等待完整响应返回

### 7.4 调用约定

- 提取器：`createSession({ role: 'memory-extractor' })`
- 压缩器：`createSession({ role: 'memory-compressor' })`
- 每次使用后必须 `session.close()`

---

## 八、MemoryManager 门面扩展

**文件：** `src/main/services/memory-manager.ts`（扩展）

### 8.1 V2Components 依赖注入

```typescript
interface V2Components {
  fileManager: MemoryFileManager
  logStore: LogStore
  indexer?: MemoryIndexer       // TASK025
  extractor?: MemoryExtractor   // TASK023
  compressor?: MemoryCompressor // TASK024
  evolutionLog?: EvolutionLog   // TASK023
  scheduler?: CheckpointScheduler // TASK024
}
```

构造函数新增可选参数：`v2Components?: V2Components`

### 8.2 方法改造矩阵

| 方法 | v2 改造 | 降级行为 |
|------|---------|---------|
| `appendLog(entry)` | 双写 v1 Markdown + v2 JSONL | v2 写入失败仅 log error |
| `getMemorySnapshot()` | 委托 MemoryFileManager.load() → 映射 | 无 v2Components → 保留 v1 |
| `updateMemory(updates)` | @deprecated，委托 MemoryFileManager.save() | 无 v2Components → 保留 v1 |
| `getLogsSince(ts)` | 委托 LogStore.getSince() | 抛 "v2 not available" |
| `getAllEntries()` | 委托 MemoryFileManager.load().entries | 抛 "v2 not available" |
| `applyExtractionReport()` | 空壳：委托 MemoryFileManager + EvolutionLog | 抛 "v2 not available" |
| `getWorkspaceContext()` | 读 .sibylla/config.json | 返回 { name: 'Unknown' } |
| `appendHarnessTrace()` | 空壳：委托 LogStore.append | 抛 "v2 not available" |
| `compress()` | 空壳 | 抛 "v2 not available" |
| `getAllArchivedEntries()` | 空壳 | 抛 "v2 not available" |
| `search()` | 空壳 | 抛 "v2 not available" |
| `getStats()` | 委托 MemoryFileManager | 抛 "v2 not available" |

### 8.3 getMemorySnapshot() 映射

从 MemoryFileSnapshot 提取 content/tokenCount/tokenDebt，签名与 v1 完全一致。

### 8.4 appendLog() 双写

保留 v1 Markdown 日志写入 → 新增 v2 LogStore.append(v2Entry)
v2 LogEntry 从 v1 entry 通过 mapV1ToV2LogEntry() 转换。

---

## 九、v1→v2 Section 映射

### 9.1 mapSectionName() 优先级

1. V1_SECTION_MAP 中文标题映射
2. 英文名直接匹配 MemorySection 枚举
3. 未匹配 → `project_convention`

### 9.2 反向映射

序列化时使用 `MEMORY_SECTION_LABELS`（`user_preference→'用户偏好'` 等）将枚举转为中文标题。

---

## 十、分步实施计划

### Step 1：安装依赖 + 创建目录（0.5 天）

| 操作 | 说明 |
|------|------|
| `npm install yaml` | YAML 解析/序列化 |
| 创建 `src/main/services/memory/` | v2 子模块目录 |
| 创建 `memory/index.ts` | 统一导出 |

**验证：** `import { parse, stringify } from 'yaml'` 可用

---

### Step 2：定义 v2 共享类型（0.5 天）

| 文件 | 改动 |
|------|------|
| `memory/types.ts` | 新建：核心类型（~80行）+ 骨架类型（~70行） |

**验证：** `npx tsc --noEmit` 通过

**自检：**
- [ ] MemorySection 使用联合类型（非 enum），支持 JSON 序列化
- [ ] 无 any 类型
- [ ] V1_SECTION_MAP 覆盖所有中文标题
- [ ] 骨架类型字段完整

---

### Step 3：扩展 shared/types.ts（0.5 天）

| 文件 | 改动 |
|------|------|
| `shared/types.ts` | +16 IPC_CHANNELS + 共享类型 + @deprecated 标记 + IPCChannelMap 扩展 |

**验证：** `npx tsc --noEmit` 通过

**自检：**
- [ ] v1 通道保留
- [ ] v2 通道符合 `memory:action` 命名
- [ ] IPCChannelMap params/return 类型一致

---

### Step 4：实现 MemoryFileManager（1.5 天）

| 文件 | 估计行数 |
|------|---------|
| `memory/memory-file-manager.ts` | ~285 行 |

**验证场景：**
1. v2 格式 MEMORY.md 正确解析 frontmatter + entries
2. v1 格式自动触发迁移
3. 迁移后旧文件备份为 MEMORY.v1.bak.md
4. 条目按 confidence × log(hits+1) 排序
5. 原子写入正确
6. malformed 条目使用安全默认值

**自检：**
- [ ] YAML 解析异常 → v1 纯文本模式
- [ ] load() 失败 → 返回空 snapshot
- [ ] 旧文件备份在 workspace 根目录

---

### Step 5：实现 LogStore（0.5 天）

| 文件 | 估计行数 |
|------|---------|
| `memory/log-store.ts` | ~105 行 |

**验证场景：**
1. append 写入 JSONL + 自动创建目录
2. getSince 时间过滤 + 跨月读取
3. countByFilter 按 type/traceType/since 过滤
4. malformed 行跳过 + warning

**自检：**
- [ ] append 失败不抛异常
- [ ] 文件不存在时返回空数组

---

### Step 6：新增 AiGatewaySession（0.5 天）

| 文件 | 改动 |
|------|------|
| `ai-gateway-client.ts` | +60 行 |

**验证：** createSession/chat/close 三个方法可用

---

### Step 7：扩展 MemoryManager 门面（1 天）

| 文件 | 改动 |
|------|------|
| `memory-manager.ts` | +145 行 |

**验证场景：**
1. v2Components 传入 → v2 方法可用
2. v2Components 不传 → 降级 v1
3. 双写 appendLog 验证
4. getMemorySnapshot 签名不变

**自检：**
- [ ] v1 IPC 通道完全不受影响
- [ ] updateMemory 标记 @deprecated

---

### Step 8：编写单元测试（1 天）

| 文件 | 测试用例数 | 覆盖 |
|------|-----------|------|
| `tests/memory/memory-file-manager.test.ts` | 16 | 空加载、v2 解析/序列化、迁移、容错 |
| `tests/memory/log-store.test.ts` | 8 | append、getSince、countByFilter、malformed |
| `tests/memory/memory-manager-v2.test.ts` | 6 | 双写、委托、降级 |

---

### Step 9：集成验证（0.5 天）

| 验证项 | 方法 |
|-------|------|
| 类型检查 | `npm run typecheck` |
| 代码规范 | `npm run lint` |
| 单元测试 | `npm run test` |
| v1→v2 迁移 | 创建 v1 格式 → 启动 → 确认自动迁移 |
| v1 通道兼容 | 6 个 IPC 通道仍正常 |
| v2 双写 | appendLog 后 Markdown 和 JSONL 均存在 |

---

## 十一、测试策略

### 11.1 分层

| 层级 | 工具 | 目标覆盖率 |
|------|------|-----------|
| 单元测试 | Vitest + mock | ≥ 80% |
| 集成测试 | Vitest + 真实文件系统 | 核心路径 100% |
| 端到端 | 手动 | 关键场景 |

### 11.2 Mock 策略

- FileManager：mock atomicWrite/readFile/exists
- Logger：mock 所有方法，验证 warning/error 调用
- fs（LogStore）：真实临时目录 + afterEach 清理
- AiGatewayClient：mock chat() 返回固定响应

### 11.3 测试数据

- v1 MEMORY.md：3 个中文 section，每个 2-3 条内容
- v2 MEMORY.md：YAML frontmatter + 4 个 section 完整条目
- JSONL：3 个月份文件，每月 5-10 条

---

## 十二、验收标准映射

| 验收标准 | 对应步骤 | 验证方法 |
|---------|---------|---------|
| v2 格式支持 YAML frontmatter | Step 4 | 单元测试 |
| `<!-- @entry -->` 元数据解析 | Step 4 | 单元测试 |
| 6 section 枚举均可解析/序列化 | Step 4 | 单元测试 |
| 条目按 confidence×log(hits+1) 排序 | Step 4 | 单元测试 |
| 原子写入 | Step 4 | 代码审查 |
| 无 frontmatter 自动迁移 | Step 4 | 单元测试 |
| 中文 section 映射 | Step 4 | 单元测试 |
| 未匹配→project_convention | Step 4 | 单元测试 |
| 旧文件重命名 MEMORY.v1.bak.md | Step 4 | 单元测试 |
| 新文件在 .sibylla/memory/ | Step 4 | 单元测试 |
| 迁移默认 confidence=0.7 | Step 4 | 单元测试 |
| LogStore append 写入 | Step 5 | 单元测试 |
| LogStore getSince 时间过滤 | Step 5 | 单元测试 |
| LogStore countByFilter | Step 5 | 单元测试 |
| JSONL malformed 行跳过 | Step 5 | 单元测试 |
| appendLog 双写 | Step 7 | 单元测试 |
| getMemorySnapshot 签名不变 | Step 7 | 类型检查 |
| updateMemory @deprecated | Step 7 | 代码审查 |
| v2Components 存在时可用 | Step 7 | 单元测试 |
| v2Components 不存在时降级 | Step 7 | 单元测试 |
| AiGatewaySession 非流式 | Step 6 | 单元测试 |
| entry malformed 安全默认值 | Step 4 | 单元测试 |
| YAML 解析异常降级 | Step 4 | 单元测试 |
| load() 失败不崩溃 | Step 4 | 单元测试 |

---

## 十三、风险评估与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| v1→v2 迁移数据丢失 | 低 | 高 | 迁移前备份 MEMORY.v1.bak.md；迁移后验证 entryCount |
| 双写一致性 | 中 | 中 | v2 写入失败仅 log error；v1 Markdown 为主路径 |
| LogStore 大文件性能 | 低 | 低 | 按月分割，单文件 < 1MB |
| MemoryManager 门面复杂 | 中 | 中 | v2Components 依赖注入：不传降级 v1，传则启用 v2 |
| 类型骨架与后续不兼容 | 中 | 中 | 骨架基于需求文档精确定义；后续可扩展不可破坏修改 |
| token 估算不准 | 中 | 低 | CJK/2 + ASCII/4 近似；后续可替换 tiktoken |

---

## 十四、文件变更清单

| 文件 | 操作 | 行数 |
|------|------|------|
| `src/main/services/memory/types.ts` | **新建** | +150 |
| `src/main/services/memory/memory-file-manager.ts` | **新建** | +285 |
| `src/main/services/memory/log-store.ts` | **新建** | +105 |
| `src/main/services/memory/index.ts` | **新建** | +10 |
| `src/main/services/memory-manager.ts` | 修改 | +145 |
| `src/main/services/ai-gateway-client.ts` | 修改 | +60 |
| `src/shared/types.ts` | 修改 | +82 |
| `tests/memory/memory-file-manager.test.ts` | **新建** | +200 |
| `tests/memory/log-store.test.ts` | **新建** | +120 |
| `tests/memory/memory-manager-v2.test.ts` | **新建** | +130 |
| **合计** | — | **~1287** |

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
