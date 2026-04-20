# MEMORY.md v2 数据层与日志存储

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK022 |
| **任务标题** | MEMORY.md v2 数据层与日志存储 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建记忆系统 v2 的数据基础层——定义 v2 全部共享类型、实现 MEMORY.md v2 格式读写与 v1→v2 自动迁移、实现 JSONL 日志存储（LogStore）、扩展 MemoryManager 为 v2 门面。这是所有后续任务（提取器、检查点、检索、UI）的地基。

### 背景

现有 v1 记忆系统（`memory-manager.ts`）使用纯 Markdown 格式的 MEMORY.md 和按日分片的 Markdown 日志。Sprint 3.2 要求升级为结构化格式（YAML frontmatter + `<!-- @entry -->` 元数据）和 JSONL 日志存储，同时确保 v1 完全兼容、平滑迁移。

**v1 现状关键约束：**

| 维度 | v1 现状 | v2 改造 |
|------|---------|---------|
| MEMORY.md 路径 | `workspaceRoot/MEMORY.md` | 迁移至 `.sibylla/memory/MEMORY.md` |
| MEMORY.md 格式 | 纯 Markdown，`## Section` + `- 内容` | YAML frontmatter + `<!-- @entry -->` 结构化 |
| Section 命名 | 自由中文标题 | 6 个固定 `MemorySection` 枚举值 |
| 日志格式 | `.sibylla/memory/daily/YYYY-MM-DD.md` | 新增 JSONL `.sibylla/memory/logs/YYYY-MM.jsonl` |
| IPC 通道 | 6 个 v1 通道 | v1 通道保留 + 新增 v2 通道 |

### 范围

**包含：**
- `types.ts` — v2 全部共享类型定义（MemorySection、MemoryEntry、MemoryFileMetadata、LogEntry、HarnessTraceType 等）
- `MemoryFileManager` — MEMORY.md v2 格式读写、解析、序列化、v1→v2 迁移
- `LogStore` — JSONL 日志存储（append、getSince、countByFilter）
- `MemoryManager` 门面扩展 — 双写日志、v1 方法兼容、v2 新增方法、v2Components 依赖注入
- `AiGatewaySession` 接口 — 为提取器和压缩器提供非流式 LLM 调用能力
- `shared/types.ts` 扩展 — v2 IPC 类型、MemoryV2StatsResponse、MemorySearchResult 等
- 单元测试

**不包含：**
- MemoryExtractor（TASK023）
- CheckpointScheduler、MemoryCompressor（TASK024）
- MemoryIndexer、EmbeddingProvider（TASK025）
- MemoryPanel UI、memoryStore（TASK026）

## 验收标准

### MEMORY.md v2 格式

- [ ] MEMORY.md v2 格式支持 YAML frontmatter（version、lastCheckpoint、totalTokens、entryCount）
- [ ] 每条记忆条目有 `<!-- @entry id=... confidence=... hits=... updated=... locked=... -->` 元数据行
- [ ] 6 个 section 枚举值均可正确解析与序列化
- [ ] 条目按 confidence × log(hits + 1) 排序输出
- [ ] 原子写入（temp + rename）正确实现

### v1→v2 迁移

- [ ] 检测到无 frontmatter 的 MEMORY.md 时自动触发迁移
- [ ] 迁移时将中文 section 标题通过映射表转为 MemorySection 枚举
- [ ] 未匹配的 section 统一归入 `project_convention`
- [ ] 迁移后旧文件重命名为 `MEMORY.v1.bak.md`
- [ ] 迁移后新文件位于 `.sibylla/memory/MEMORY.md`
- [ ] 迁移后条目默认 confidence = 0.7

### LogStore

- [ ] `append(entry)` 正确写入 `.sibylla/memory/logs/YYYY-MM.jsonl`
- [ ] `getSince(timestamp)` 仅返回时间戳之后的条目
- [ ] `countByFilter(filter)` 支持按 type、traceType、since 过滤计数
- [ ] JSONL 格式每行一个 JSON 对象，malformed 行被跳过并记录 warning

### MemoryManager 门面

- [ ] `appendLog()` 双写：同时写 v1 Markdown 日志和 v2 JSONL 日志
- [ ] `getMemorySnapshot()` 签名不变，内部改为调用 MemoryFileManager.load() 并映射返回值
- [ ] `updateMemory()` 标记 `@deprecated`，内部委托 MemoryFileManager
- [ ] 新增 `getLogsSince(timestamp)` 委托 LogStore
- [ ] 新增 `getAllEntries()` 委托 MemoryFileManager
- [ ] 新增 `applyExtractionReport()` 委托 MemoryFileManager（空壳，TASK023 填充）
- [ ] 新增 `getWorkspaceContext()` 返回 `{ name, description? }`
- [ ] v2Components 不传时降级到 v1 行为（所有 v2 方法抛 "not available" 或回退）

### AiGatewaySession

- [ ] `AiGatewayClient.createSession()` 返回 `AiGatewaySession` 实例
- [ ] `session.chat()` 调用非流式 `AiGatewayClient.chat()`
- [ ] `session.close()` 执行清理逻辑
- [ ] 非流式 `chat()` 方法新增到 `AiGatewayClient`

### 异常与降级

- [ ] entry 元数据 malformed（缺 confidence、无效日期）时使用安全默认值并记录 warning
- [ ] YAML 解析异常时以 v1 纯文本模式读取，标记待迁移
- [ ] MemoryFileManager.load() 失败不崩溃，返回空 snapshot

## 依赖关系

### 前置依赖

- [x] MemoryManager v1（`src/main/services/memory-manager.ts`，95% 完成）
- [x] AiGatewayClient（`src/main/services/ai-gateway-client.ts`，70% 完成）
- [x] FileManager 原子写入（`src/main/services/file-manager.ts`，100% 完成）
- [x] TASK016（记忆系统 IPC 暴露与联调）— v1 IPC 通道已注册

### 被依赖任务

- TASK023（精选记忆提取器）— 依赖 types.ts、LogStore、MemoryManager.getAllEntries()
- TASK024（检查点与压缩）— 依赖 LogStore、MemoryManager.getLogsSince()
- TASK025（向量索引）— 依赖 types.ts 中 MemoryEntry 类型
- TASK026（记忆面板 UI）— 依赖 MemoryManager v2 方法、IPC 类型

## 参考文档

- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — 需求 3.2.1、1.7.x、4.2.1、4.2.4、4.2.7
- [`specs/design/memory-system-design.md`](../../design/memory-system-design.md) — 三层存储设计
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 通信接口
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、原子写入、TypeScript 严格模式
- `.kilocode/skills/phase1/typescript-strict-mode/SKILL.md` — 类型设计规范

## 技术执行路径

### 架构设计

```
MemoryManager v2 门面架构

src/main/services/
├── memory-manager.ts          ← v2 门面（扩展）
│   ├── v1 方法（签名不变，内部委托）
│   ├── v2 新增方法
│   └── v2Components? 依赖注入
│
└── memory/                    ← v2 子目录（新建）
    ├── types.ts               ← 共享类型
    ├── memory-file-manager.ts ← MEMORY.md v2 读写
    ├── log-store.ts           ← JSONL 日志存储
    └── index.ts               ← 统一导出

数据流向：

appendLog(entry)
├── v1: .sibylla/memory/daily/YYYY-MM-DD.md (Markdown)
└── v2: .sibylla/memory/logs/YYYY-MM.jsonl (JSONL) ← LogStore

getMemorySnapshot()
└── MemoryFileManager.load() → parse YAML+entries → 映射为 v1 返回格式

getAllEntries()
└── MemoryFileManager.load() → entries[]
```

### 步骤 1：定义 v2 共享类型

**文件：** `src/main/services/memory/types.ts`

1. 定义 `MemorySection` 联合类型：`'user_preference' | 'technical_decision' | 'common_issue' | 'project_convention' | 'risk_note' | 'glossary'`
2. 定义 `MemoryEntry` 接口：id、section、content、confidence（0-1）、hits、createdAt、updatedAt、sourceLogIds、locked、tags
3. 定义 `MemoryFileMetadata` 接口：version=2、lastCheckpoint、totalTokens、entryCount
4. 定义 `MemoryFileSnapshot` 接口：metadata + entries[]
5. 定义 `LogEntry` 接口：id（`log-YYYYMMDD-NNN`）、type（MemoryLogType | 'harness_trace'）、timestamp、sessionId、summary、details?、tags?、relatedFiles?、operator?、traceType?、severity?
6. 定义 `HarnessTraceType` 联合类型：`'guardrail_triggered' | 'sensor_signal' | 'evaluator_verdict' | 'mode_degraded' | 'task_state_change'`
7. 定义 `HarnessTraceEvent` 接口：id、traceType、timestamp、sessionId、taskId?、details、severity
8. 定义 `V1_SECTION_MAP` 常量：中文标题 → MemorySection 枚举映射表
9. 定义 `ExtractionInput`、`ExtractionCandidate`、`ExtractionReport` 接口骨架（TASK023 填充实现）
10. 定义 `CompressionResult`、`EvolutionEvent`、`CheckpointRecord` 接口骨架（TASK024 填充实现）
11. 定义 `HybridSearchResult`、`SearchOptions` 接口骨架（TASK025 填充实现）

### 步骤 2：扩展 shared/types.ts

**文件：** `src/shared/types.ts`

1. 在 `IPCChannelMap` 中新增 v2 通道类型：
   - `'memory:listEntries'` → `Promise<MemoryEntry[]>`
   - `'memory:listArchived'` → `Promise<MemoryEntry[]>`
   - `'memory:search'` → `Promise<HybridSearchResult[]>`
   - `'memory:getEntry'` → `Promise<MemoryEntry | null>`
   - `'memory:getStats'` → `Promise<MemoryV2StatsResponse>`
   - `'memory:updateEntry'` → `Promise<void>`
   - `'memory:deleteEntry'` → `Promise<void>`
   - `'memory:lockEntry'` → `Promise<void>`
   - `'memory:triggerCheckpoint'` → `Promise<CheckpointRecord>`
   - `'memory:triggerCompression'` → `Promise<CompressionResult>`
   - `'memory:undoLastCompression'` → `Promise<void>`
   - `'memory:getEvolutionHistory'` → `Promise<EvolutionEvent[]>`
   - `'memory:rebuildIndex'` → `Promise<void>`
   - `'memory:getIndexHealth'` → `Promise<{ healthy: boolean; entryCount: number }>`
   - `'memory:getConfig'` → `Promise<MemoryConfig>`
   - `'memory:updateConfig'` → `Promise<void>`
2. 新增 v2 响应类型：
   - `MemoryV2StatsResponse`：totalTokens、entryCount、lastCheckpoint、sections
   - `MemorySearchResult`：id、section、content、confidence、score、source
   - `MemoryConfig`：checkpointInterval、interactionThreshold、extractorModel、searchWeights、compressionThreshold、embeddingProvider
3. 保留 v1 类型（标记 `@deprecated`）：`MemorySnapshotResponse`、`MemoryUpdateItem`、`DailyLogEntry`、`RagSearchHit`
4. 新增 `ContextLayerType` 扩展：`'always' | 'manual' | 'skill' | 'memory'`（为 TASK025 预留）

### 步骤 3：实现 MemoryFileManager

**文件：** `src/main/services/memory/memory-file-manager.ts`

1. 构造函数注入 workspaceRoot、FileManager、Logger
2. 实现 `memoryPath()` 返回 `.sibylla/memory/MEMORY.md`
3. 实现 `load()` 方法：
   - 检查 `.sibylla/memory/MEMORY.md` 是否存在
   - 不存在 → 检查 `workspaceRoot/MEMORY.md`（v1 路径）是否存在
   - 存在 v1 路径 → 调用 `migrateFromV1()`
   - 均不存在 → 返回 `createEmpty()`
   - 存在 v2 路径 → `parseMarkdown(raw)` 解析
   - 解析后检查 `metadata.version !== 2` → 调用 `migrateFromV1()`
4. 实现 `parseMarkdown(raw)` 方法：
   - 正则匹配 YAML frontmatter：`/^---\n([\s\S]*?)\n---\n([\s\S]*)$/`
   - 使用 `yaml` 库 `parseYaml()` 解析 frontmatter 为 `MemoryFileMetadata`
   - 调用 `parseEntries(body)` 解析条目
   - 返回 `{ metadata, entries }`
5. 实现 `parseEntries(body)` 方法：
   - 调用 `splitBySection(body)` 按 `## ` 标题分节
   - 对每个 section 调用 `mapSectionName()` 映射为 `MemorySection` 枚举
   - 正则匹配 `<!-- @entry ([^>]+) -->` 提取元数据
   - 调用 `parseEntryMetadata()` 解析键值对（id、confidence、hits、updated、locked）
   - 解析 `<!-- source: ... -->` 行提取 sourceLogIds
   - malformed 条目记录 warning 并跳过，不影响其他条目
6. 实现 `mapSectionName(sectionName)` 方法：
   - 优先查 `V1_SECTION_MAP` 映射
   - 英文 section 名直接匹配 MemorySection 枚举
   - 未匹配返回 `'project_convention'`
7. 实现 `save(snapshot)` 方法：
   - 调用 `serialize(snapshot)` 生成 Markdown 文本
   - 调用 `FileManager.atomicWrite(path, content)` 原子写入
8. 实现 `serialize(snapshot)` 方法：
   - 生成 YAML frontmatter（`stringifyYaml(metadata)`）
   - 按 section 分组条目
   - 每个 section 内按 `confidence × Math.log(hits + 1)` 降序排列
   - 每条目输出 `<!-- @entry id=... confidence=... hits=... updated=... locked=... -->` + 内容 + `<!-- source: ... -->`
9. 实现 `migrateFromV1(raw)` 方法：
   - 按中文 section 标题 `## ` 分节
   - 每个 section 内按段落分割为条目
   - 使用 `V1_SECTION_MAP` 映射 section 名
   - 每条目赋予默认 confidence = 0.7、hits = 0、生成 ID（`migrated-NNN`）
   - 使用 `estimateTokens(raw)` 估算 totalTokens
   - 调用 `save(snapshot)` 写入新路径
   - 将旧文件 `workspaceRoot/MEMORY.md` 重命名为 `MEMORY.v1.bak.md`
   - 记录迁移日志 `memory.migrate.v1.completed`
10. 实现 `estimateTokens(text)` 方法：
    - 简单估算：字符数 / 4（英文）或 字符数 / 2（中文混合）
    - 或使用 tiktoken 估算（如果已集成）
11. 实现 `createEmpty()` 方法：返回 version=2 的空 snapshot

### 步骤 4：实现 LogStore

**文件：** `src/main/services/memory/log-store.ts`

1. 构造函数注入 workspaceRoot、Logger
2. 实现 `append(entry: LogEntry)` 方法：
   - 从 `entry.timestamp` 提取月份（`YYYY-MM`）
   - 构建路径 `.sibylla/memory/logs/YYYY-MM.jsonl`
   - 确保目录存在（`mkdir recursive`）
   - 追加写入 `JSON.stringify(entry) + '\n'`
   - 写入失败记录 error 日志但不抛出（非阻塞）
3. 实现 `getSince(timestamp: string)` 方法：
   - 列出 `.sibylla/memory/logs/` 下所有 `.jsonl` 文件
   - 按文件名排序（自然按月排序）
   - 逐文件逐行解析 JSON
   - 跳过 malformed 行（记录 warning）
   - 过滤 `entry.timestamp >= timestamp` 的条目
   - 返回过滤后的 LogEntry[]
4. 实现 `countByFilter(filter)` 方法：
   - 支持 `type?`、`traceType?`、`since?`、`details?` 过滤条件
   - 遍历所有 JSONL 文件，解析并计数匹配条目
   - `details` 过滤：检查 entry 的 details 字段是否包含指定的 key-value 对
5. 实现文件路径辅助方法 `logsDir()` → `.sibylla/memory/logs/`

### 步骤 5：新增 AiGatewaySession 接口

**文件：** `src/main/services/ai-gateway-client.ts`（扩展）

1. 定义 `AiGatewaySession` 接口：
   ```typescript
   export interface AiGatewaySession {
     chat(request: Omit<AiGatewayChatRequest, 'stream'>): Promise<AiGatewayChatResponse>
     close(): void
   }
   ```
2. 实现 `AiGatewaySessionImpl` 内部类：
   - 持有 AiGatewayClient 引用和 role 字符串
   - `chat()` 调用 `client.chat({ ...request, stream: false })`
   - `close()` 执行 usage 日志记录等清理
3. 在 `AiGatewayClient` 中新增 `createSession(options)` 方法
4. 在 `AiGatewayClient` 中新增非流式 `chat()` 方法（如不存在）：
   - 复用现有 HTTP 客户端
   - `stream: false` 参数
   - 等待完整响应返回

### 步骤 6：扩展 MemoryManager 为 v2 门面

**文件：** `src/main/services/memory-manager.ts`（扩展）

1. 新增可选依赖注入参数：
   ```typescript
   constructor(
     // ... existing params
     v2Components?: {
       fileManager: MemoryFileManager
       logStore: LogStore
       indexer?: MemoryIndexer       // TASK025 填充
       extractor?: MemoryExtractor   // TASK023 填充
       compressor?: MemoryCompressor // TASK024 填充
       evolutionLog?: EvolutionLog   // TASK023 填充
       scheduler?: CheckpointScheduler // TASK024 填充
     }
   )
   ```
2. 改造 `appendLog(entry)` — 双写：
   - 保留原有 v1 Markdown 日志写入逻辑
   - 新增：`if (this.v2Components?.logStore) { await this.v2Components.logStore.append(v2Entry) }`
   - v2 LogEntry 从 v1 entry 映射转换
3. 改造 `getMemorySnapshot()`：
   - `if (this.v2Components?.fileManager)` → 调用 `fileManager.load()` → 映射为 `{ content, tokenCount, tokenDebt }`
   - 否则保留 v1 逻辑
4. 改造 `updateMemory(updates)`：
   - 标记 `@deprecated`
   - `if (this.v2Components?.fileManager)` → 转换为 MemoryEntry 后调用 `fileManager.save()`
   - 否则保留 v1 逻辑
5. 新增 `getLogsSince(timestamp)`：
   - `if (this.v2Components?.logStore)` → `logStore.getSince(timestamp)`
   - 否则抛 "v2 not available" 错误
6. 新增 `getAllEntries()`：
   - `if (this.v2Components?.fileManager)` → `fileManager.load()` → `.entries`
   - 否则抛 "v2 not available" 错误
7. 新增 `applyExtractionReport(report)` 空壳：
   - 委托 MemoryFileManager 更新条目 + EvolutionLog 记录
   - TASK023 完成后填充实际逻辑
8. 新增 `getWorkspaceContext()`：
   - 从 workspace config.json 读取 name 和 description
9. 新增 `appendHarnessTrace(event: HarnessTraceEvent)` 空壳：
   - 委托 LogStore.append + detectKeyEvents
   - TASK024 完成后填充 detectKeyEvents 逻辑
10. 新增 `compress()` 空壳：
    - 委托 MemoryCompressor.compress()
    - TASK024 完成后填充
11. 新增 `getAllArchivedEntries()` 空壳：
    - 从 ARCHIVE.md 读取
    - TASK024 完成后填充
12. 新增 `search(query, options)` 空壳：
    - 委托 MemoryIndexer.search()
    - TASK025 完成后填充

### 步骤 7：实现 v1→v2 Section 映射

**文件：** `src/main/services/memory/types.ts`（在步骤 1 中已定义常量）

1. `V1_SECTION_MAP` 常量内容：
   ```typescript
   export const V1_SECTION_MAP: Record<string, MemorySection> = {
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
   ```
2. 在 MemoryFileManager 的 `mapSectionName()` 中使用此映射
3. 未匹配的 section 返回 `'project_convention'`

### 步骤 8：安装与配置 yaml 依赖

1. `npm install yaml` — YAML frontmatter 解析/序列化库（~80KB，纯 JS，低风险）
2. 在 `MemoryFileManager` 中 `import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'`
3. 确保 `yaml` 在 `package.json` 的 `dependencies` 中（非 optional）

### 步骤 9：编写单元测试

**文件：** `tests/memory/memory-file-manager.test.ts`

1. 测试空 MEMORY.md 加载 → 返回空 snapshot
2. 测试 v2 格式 MEMORY.md 解析：
   - frontmatter 正确解析（version=2, totalTokens, entryCount）
   - 条目元数据正确解析（id, confidence, hits, updated, locked）
   - sourceLogIds 正确提取
   - 多 section 正确分组
3. 测试 v2 格式序列化：
   - frontmatter 正确输出
   - 条目按 confidence × log(hits+1) 排序
   - 锁定条目标记正确
4. 测试 v1→v2 迁移：
   - 中文 section 正确映射
   - 未匹配 section 归入 project_convention
   - 默认 confidence = 0.7
   - 旧文件重命名为 MEMORY.v1.bak.md
   - 新文件位于 .sibylla/memory/MEMORY.md
5. 测试 malformed 条目跳过：
   - 缺少 confidence → 使用默认 0.5
   - 无效日期 → 使用当前时间
   - 整行格式错误 → 记录 warning 并跳过

**文件：** `tests/memory/log-store.test.ts`

1. 测试 append 正确写入 JSONL 文件
2. 测试 append 自动创建月份文件
3. 测试 getSince 时间过滤
4. 测试 getSince 跨月文件读取
5. 测试 countByFilter 按 type/traceType/since 过滤
6. 测试 malformed JSONL 行被跳过

**文件：** `tests/memory/memory-manager-v2.test.ts`

1. 测试双写 appendLog：v1 Markdown + v2 JSONL 同时写入
2. 测试 getMemorySnapshot 委托 MemoryFileManager
3. 测试 updateMemory(@deprecated) 委托 MemoryFileManager
4. 测试 v2Components 不传时降级到 v1 行为
5. 测试新增 v2 方法在 v2Components 存在时可用
6. 测试新增 v2 方法在 v2Components 不存在时返回降级响应

### 步骤 10：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 手动验证 v1→v2 迁移：
   - 创建 v1 格式 MEMORY.md
   - 启动应用
   - 确认自动迁移生成 v2 格式
   - 确认旧文件备份存在

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
