# 可观测性 UI 与性能监控

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK029 |
| **任务标题** | 可观测性 UI 与性能监控 |
| **所属阶段** | Phase 1 - Trace 系统、任务台账与可观测性 (Sprint 3.3) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.3 的用户可见层——实现对话气泡执行轨迹视图（用户级简化）、Trace Inspector 开发者面板（完整 Span 树）、Progress 任务面板、PerformanceMonitor 性能监控与阈值预警、ReplayEngine 回放与上下文重建、TraceExporter 导出与脱敏。将 TASK027/028 的后端能力完整暴露给用户。

### 背景

TASK027 已实现 Tracer SDK 和 TraceStore 持久化，TASK028 已实现 ProgressLedger 任务台账。本任务将这些后端能力转化为用户可交互的 UI 组件，并补充性能监控、回放、导出等高级功能。

**设计原则核心：**
- 分层展示——普通用户看执行轨迹简化视图，开发者看 Trace Inspector 完整视图
- 零阻塞——性能监控异步聚合，告警不打断工作流
- 用户可控——Trace 数据可导出脱敏，告警可屏蔽
- 渲染进程严格隔离——所有数据查询通过 IPC

**现有代码关键约束：**

| 维度 | 现状 | TASK029 改造 |
|------|------|-------------|
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` — AI 对话 UI | 消息气泡新增 traceId prop 和 ExecutionTrace 挂载点 |
| AIStreamEnd | 新增 traceId 字段（TASK027） | 渲染进程读取 traceId 用于执行轨迹查询 |
| IPC 通道 | TASK027/028 注册了全部后端通道 | 渲染进程 Zustand store 通过 IPC 获取数据 |

### 范围

**包含：**
- `ExecutionTrace.tsx` — 对话气泡执行轨迹视图（用户级简化时间线）
- `TraceInspector.tsx` + 子组件 — 开发者面板（火焰图/树形/时间线/性能统计/详情/搜索/导出）
- `ProgressPanel.tsx` + 子组件 — 任务面板
- `traceStore.ts` — Zustand store（Trace Inspector 状态）
- `progressStore.ts` — Zustand store（Progress 面板状态）
- `performance-monitor.ts` — PerformanceMonitor 主进程服务
- `replay-engine.ts` — ReplayEngine 回放与上下文重建
- `trace-exporter.ts` — TraceExporter 导出与脱敏
- IPC handler（trace.ts）— Trace 查询/导出/回放通道注册
- Preload API 扩展 — trace / performance / progress 方法暴露
- 键盘快捷键注册 — Ctrl+Shift+T 打开 Trace Inspector
- 单元测试

**不包含：**
- 云端 Trace 上传（Sprint 4+）
- OTLP 外接导出（未来扩展）

## 验收标准

### 对话气泡执行轨迹

- [ ] AI 消息完成后显示"🔍 展开执行轨迹"按钮
- [ ] 点击按钮在气泡内展开简化时间线，渲染 < 100ms
- [ ] 只展示用户可见 Span（白名单过滤：context.assemble / ai.llm-call / harness.guardrail / harness.sensor / harness.evaluator / tool.file-write / tool.file-read / memory.search）
- [ ] 耗时异常 Span（> 同名 Span 中位数 3 倍）橙色高亮
- [ ] 失败或降级 Span 红色标记，hover 显示错误消息
- [ ] 点击 Span 行显示属性详情 popover
- [ ] "查看完整 Trace"链接打开 Trace Inspector 并预选 traceId
- [ ] Trace 数据仍在写入时自动刷新一次

### Trace Inspector

- [ ] `Ctrl+Shift+T`（macOS `Cmd+Shift+T`）打开面板
- [ ] 左侧列表显示最近 100 条 Trace，按时间倒序
- [ ] 选中 Trace 后中间渲染火焰图 < 300ms（< 500 spans）
- [ ] 火焰图横轴时间、纵轴层级，块宽度表示耗时
- [ ] 点击 Span 显示右侧详情（attributes、events、status、timing、父子链）
- [ ] 四种视图切换：火焰图 / 树形 / 时间线 / 性能统计
- [ ] 底部搜索栏全文搜索 attribute values
- [ ] 错误 Span 红色边框，面板自动展开到错误处
- [ ] 对比模式可选第二条 Trace 并排展示
- [ ] 导出功能生成自包含 JSON bundle

### Progress 任务面板

- [ ] 面板展示当前 active / completedRecent / queued 任务
- [ ] 每条任务显示 ID、标题、状态、耗时、Trace 链接
- [ ] 进行中任务实时更新耗时
- [ ] Trace 链接点击跳转 Trace Inspector
- [ ] 任务事件实时推送（IPC event 监听）

### PerformanceMonitor

- [ ] 每 60 秒聚合滚动 15 分钟窗口指标
- [ ] 慢调用 > 10s 标记 `alert.slow=true`
- [ ] Token 异常 > 30K 标记
- [ ] 错误率 > 5%（最近 50 次）标记
- [ ] 降级频次 > 3 次/15min 标记
- [ ] 连续 3 个窗口达标触发告警通知
- [ ] 告警含预估美元成本（基于 model pricing config）
- [ ] 用户可屏蔽特定告警类型 24 小时
- [ ] 连续 5 个窗口恢复正常后自动清除告警
- [ ] 重启后屏蔽状态恢复

### ReplayEngine

- [ ] "重建快照"提取原始 prompt、上下文文件、记忆状态、模型参数
- [ ] 记忆快照近似时标记 `isApproximate=true`
- [ ] 文件已删除时替换为 `[文件已删除]` placeholder
- [ ] "Rerun" 确认对话框 → 使用当前配置重新请求 → 新 Trace 含 `replay.of` 属性
- [ ] 原 Trace 显示"相关回放"列表

### TraceExporter

- [ ] "导出 Trace" 扫描并显示脱敏预览 < 1 秒
- [ ] 预览列出所有将被替换的字段及匹配原因
- [ ] 用户可添加自定义脱敏规则（regex on key/value）
- [ ] 确认导出生成 JSON 文件，不含原始敏感信息
- [ ] 导入 Trace 标记 `imported` 前缀
- [ ] 文件内容默认不嵌入（用户显式启用 + 警告）

### IPC 集成

- [ ] Trace IPC handler 注册（trace.ts）
- [ ] Performance IPC handler 注册
- [ ] 所有新 IPC 通道类型安全
- [ ] Preload API 扩展 trace / performance / progress 方法
- [ ] 主进程→渲染进程事件正确推送

## 依赖关系

### 前置依赖

- [x] TASK027 — Tracer SDK 与 Trace 持久化存储
- [x] TASK028 — progress.md 任务台账与 AI 自声明集成
- [x] StudioAIPanel（`src/renderer/components/studio/StudioAIPanel.tsx`）
- [x] Zustand 状态管理已选型
- [x] IPC 通道常量已在 TASK027/028 中注册

### 被依赖任务

- 无（Sprint 3.3 的最终交付任务）

## 参考文档

- [`specs/requirements/phase1/sprint3.3-trace.md`](../../requirements/phase1/sprint3.3-trace.md) — 需求 3.3.5 + 3.3.6 + 3.3.7 + 3.3.8 + 3.3.9
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 色彩体系、交互规范
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — UI/UX 红线、原子写入、2秒等待进度反馈
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 流式数据传输
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` — 流式响应集成
- `.kilocode/skills/common/frontend-design/SKILL.md` — 前端设计规范

## 技术执行路径

### 架构设计

```
可观测性 UI 整体架构

src/main/services/
├── trace/
│   ├── performance-monitor.ts       ← 性能聚合与告警（新建）
│   ├── replay-engine.ts             ← 回放与快照重建（新建）
│   └── trace-exporter.ts            ← 导出与脱敏（新建）
│
├── ipc/handlers/
│   └── trace.ts                     ← IPC: Trace 查询/导出/回放（新建）
│
src/renderer/
├── store/
│   ├── traceStore.ts                ← Trace Inspector 状态（新建）
│   └── progressStore.ts            ← Progress 面板状态（新建）
│
├── components/
│   ├── conversation/
│   │   └── ExecutionTrace.tsx       ← 对话气泡执行轨迹（新建）
│   │
│   ├── inspector/                   ← Trace Inspector 目录（新建）
│   │   ├── TraceInspector.tsx       ← 主面板
│   │   ├── TraceList.tsx            ← 左侧 Trace 列表
│   │   ├── FlameGraph.tsx           ← 火焰图（Canvas）
│   │   ├── SpanTreeView.tsx         ← 树形视图
│   │   ├── TimelineView.tsx         ← 时间线视图
│   │   ├── PerformanceStats.tsx     ← 性能统计
│   │   ├── SpanDetailPane.tsx       ← 右侧 Span 详情
│   │   ├── SearchBar.tsx            ← 全文搜索
│   │   └── ExportDialog.tsx         ← 导出脱敏对话框
│   │
│   └── progress/                    ← Progress 目录（新建）
│       ├── ProgressPanel.tsx        ← 主面板
│       ├── TaskCard.tsx             ← 任务卡片
│       └── TaskChecklist.tsx        ← 清单渲染

数据流向：

用户点击"展开执行轨迹"
  → traceStore.getTraceTree(traceId) → IPC → TraceStore.getTraceTree()
  → filterAndGroupSpans() → USER_VISIBLE_SPANS 白名单过滤
  → computeMedianDurationsByName() → 异常耗时检测
  → 渲染简化时间线

用户打开 Trace Inspector
  → traceStore.getRecentTraces(100) → IPC → TraceStore.getRecentTraces()
  → 用户选中 Trace → traceStore.getTraceTree(traceId) → IPC → TraceStore.getTraceTree()
  → 渲染火焰图 / 树形 / 时间线
  → 用户点击 Span → SpanDetailPane 显示 attributes/events/timing

PerformanceMonitor 每 60s
  → computeMetrics() → TraceStore.query() 查询最近 15min 的 Span
  → 检查各阈值 → 连续 3 窗口达标 → emitPerformanceAlert()
  → 渲染进程监听 → 显示通知
```

### 步骤 1：实现 PerformanceMonitor

**文件：** `src/main/services/trace/performance-monitor.ts`

1. 定义 `PerformanceMetrics` 接口：
   - windowStart / windowEnd
   - llmCallCount / llmCallAvgDurationMs / llmCallP95DurationMs
   - errorRate / totalTokens / estimatedCostUSD
   - degradationCount / activeSpanCount
2. 定义 `PerformanceAlert` 接口：
   - id / type（slow_call / token_spike / error_rate / degradation / leak）
   - severity（info / warn / critical）/ message / metrics
   - firstSeenAt / consecutiveWindows
3. 定义 `PerformanceConfig` 接口：
   - slowCallThresholdMs（默认 10000）
   - tokenSpikeThreshold（默认 30000）
   - errorRateThreshold（默认 0.05）
   - degradationThreshold（默认 3）
   - activeSpanLeakThreshold（默认 100）
   - modelPricingConfig（{ model: price_per_1k_tokens }）
4. 定义 `AlertState` 内部接口：consecutiveCount / wasAlerting
5. 构造函数注入：traceStore、config、eventBus、logger
6. 内部状态：
   - `alertsStates: Map<string, AlertState>` — 各告警类型的连续窗口计数
   - `suppressions: Map<string, number>` — 屏蔽到期时间戳
   - `aggregationInterval?: NodeJS.Timeout`
7. 实现 `start()` 方法：
   - `this.aggregationInterval = setInterval(() => this.aggregateAndAlert(), 60000)`
8. 实现 `stop()` 方法：
   - 清除 interval
9. 实现 `aggregateAndAlert()` 方法：
   - 调用 `computeMetrics()` 获取当前指标
   - `eventBus.emitPerformanceMetrics(metrics)`
   - 遍历 `alertCheckers()`：
     - 调用 `checker.check(metrics, config)` 判断是否违规
     - 更新 AlertState：breach 时 consecutiveCount++，否则 consecutiveCount--
     - consecutiveCount === 3 且未被屏蔽：构造 PerformanceAlert 并 emitPerformanceAlert()
     - consecutiveCount 降到 0 且 wasAlerting：emitPerformanceAlertCleared()
   - 更新 alertsStates Map
10. 实现 `computeMetrics()` 方法：
    - 查询 TraceStore 最近 15 分钟的 ai-call kind Span
    - 计算 llmCallCount、avgDuration、P95 duration
    - 计算 errorRate = error_count / total_count
    - 计算 totalTokens（从 attributes.token_count 求和）
    - 计算 estimatedCostUSD（基于 modelPricingConfig）
    - 查询 degradation 事件数
    - 查询 activeSpanCount
11. 实现 `alertCheckers()` 工厂方法：
    - 返回一组 Checker 对象：slow_call / token_spike / error_rate / degradation / leak
    - 每个 Checker 有 check() / type / severity / buildMessage() 方法
12. 实现 `suppress(alertType, durationMs)` 方法：
    - `this.suppressions.set(alertType, Date.now() + durationMs)`
    - 持久化到 config 以支持重启恢复
13. 实现 `isSuppressed(alertType)` 方法：
    - 检查 suppressions 中是否有未过期的条目
14. 实现 `getMetrics()` 方法：返回最近一次 computeMetrics 结果
15. 实现 `getAlerts()` 方法：返回当前活跃告警列表

### 步骤 2：实现 ReplayEngine

**文件：** `src/main/services/trace/replay-engine.ts`

1. 定义 `TraceSnapshot` 接口：
   - traceId / reconstructedAt / originalTimestamp
   - isApproximate / approximationReasons: string[]
   - prompt: { system; user; assistant? }
   - contextFiles: Array<{ path; contentAtTime; existsNow }>
   - memorySnapshot: { entries: MemoryEntry[]; totalTokens: number }
   - modelConfig: { model; temperature; maxTokens }
2. 构造函数注入：traceStore、memoryManager、fileManager、aiGateway、tracer、logger
3. 实现 `rebuildSnapshot(traceId)` 方法：
   - 查询 `traceStore.getTraceTree(traceId)` 获取所有 Span
   - 找到 `ai.llm-call` Span
   - 从 llm Span attributes 提取 prompt.system / prompt.user / response.content
   - 从 llm Span attributes 提取 context.files 路径列表
   - 调用 `reconstructContextFiles()` 重建上下文文件
   - 调用 `memoryManager.getSnapshotAt(llmSpan.startTimeMs)` 获取记忆快照
   - 若记忆快照非精确，追加 `memory_snapshot_approximate` 到 approximationReasons
   - 从 llm Span attributes 提取 model / temperature / max_tokens
   - 返回 TraceSnapshot
4. 实现 `reconstructContextFiles(filePaths, timestamp, reasons)` 方法：
   - 对每个文件路径，调用 `fileManager.readFile(path)`
   - 若文件存在：{ path, content: 当前内容, existsNow: true }
   - 若文件不存在：{ path, content: '[文件已删除]', existsNow: false }，追加原因
   - 返回 contextFiles 数组
5. 实现 `rerun(traceId)` 方法：
   - 调用 `rebuildSnapshot(traceId)` 获取快照
   - 使用 `tracer.withSpan('ai.llm-call.rerun', ...)` 包裹
   - span.setAttributes 设置 replay.of、replay.original_timestamp、replay.is_approximate
   - 调用 `aiGateway.chat()` 发送相同 prompt
   - span.setAttribute('response.content', response.content)
   - 返回 `{ newTraceId: span.context.traceId }`
6. 实现 `getRelatedReruns(traceId)` 方法：
   - 查询 `traceStore.query({ attributeFilters: { 'replay.of': traceId } })`
   - 返回相关回放列表

### 步骤 3：实现 TraceExporter

**文件：** `src/main/services/trace/trace-exporter.ts`

1. 定义 `RedactionRule` 接口：id、keyPattern?、valuePattern?、reason
2. 定义 `TraceExportBundle` 接口：exportVersion=1、exportedAt、sibyllaVersion、workspaceIdAnonymized、redactionRules、spans、checksum
3. 定义 `DEFAULT_RULES` 常量：
   - api_key（keyPattern: /.*_key$/i）
   - token（keyPattern: /.*_token$/i）
   - email（valuePattern: email regex）
   - user_path（valuePattern: /Users/[^/]+/ 等）
4. 构造函数注入：traceStore、logger
5. 实现 `preview(traceIds, customRules?)` 方法：
   - 合并默认规则和自定义规则
   - 查询 `traceStore.getMultipleTraces(traceIds)`
   - 对每个 Span 执行 `redactSpan(span, rules, report)`
   - 返回 `{ spans: redactedSpans, redactionReport }`
   - redactionReport 每条记录：spanId、fieldPath、ruleId、reason
6. 实现 `redactSpan(span, rules, report)` 私有方法：
   - 对 attributes 和 events.attributes 执行脱敏
   - 匹配 keyPattern：替换值为 [REDACTED]
   - 匹配 valuePattern：替换值为 [REDACTED]
   - 记录到 report
7. 实现 `export(traceIds, outputPath, customRules?, options?)` 方法：
   - 调用 `preview()` 获取脱敏后的 spans
   - 构建 TraceExportBundle
   - 计算 checksum
   - 写入 JSON 文件（`fs.writeFile`）
8. 实现 `import(filePath)` 方法：
   - 读取 JSON 文件
   - 校验 exportVersion === 1
   - 为所有 spanId/traceId 添加 `imported-` 前缀避免冲突
   - 标记 `_imported: true`、`_source_file`
   - 调用 `traceStore.writeBatch(importedSpans)`
   - 返回 `{ traceIds }`
9. 实现 `anonymizeWorkspaceId()` 私有方法：
   - 使用 hash 替换真实 workspaceId
10. 实现 `computeChecksum(spans)` 私有方法：
    - 对序列化后的 spans 计算简单 checksum

### 步骤 4：实现 IPC Handler（trace.ts）

**文件：** `src/main/ipc/handlers/trace.ts`（新建）

1. 注册 `TRACE_GET_TREE` handler：`traceStore.getTraceTree(traceId)`
2. 注册 `TRACE_QUERY` handler：`traceStore.query(filter)`
3. 注册 `TRACE_GET_RECENT` handler：`traceStore.getRecentTraces(limit)`
4. 注册 `TRACE_GET_STATS` handler：`traceStore.getStats()`
5. 注册 `TRACE_LOCK` handler：`traceStore.lockTrace(traceId, reason)`
6. 注册 `TRACE_UNLOCK` handler：`traceStore.unlockTrace(traceId)`
7. 注册 `TRACE_CLEANUP` handler：`traceStore.cleanup(retentionDays)`
8. 注册 `TRACE_PREVIEW_EXPORT` handler：`traceExporter.preview(traceIds, customRules)`
9. 注册 `TRACE_EXPORT` handler：`traceExporter.export(traceIds, outputPath, customRules, options)`
10. 注册 `TRACE_IMPORT` handler：`traceExporter.import(filePath)`
11. 注册 `TRACE_REBUILD_SNAPSHOT` handler：`replayEngine.rebuildSnapshot(traceId)`
12. 注册 `TRACE_RERUN` handler：`replayEngine.rerun(traceId)`（需确认对话框逻辑在渲染进程）
13. 注册 `PERFORMANCE_GET_METRICS` handler：`performanceMonitor.getMetrics()`
14. 注册 `PERFORMANCE_GET_ALERTS` handler：`performanceMonitor.getAlerts()`
15. 注册 `PERFORMANCE_SUPPRESS` handler：`performanceMonitor.suppress(type, durationMs)`
16. 注册主进程→渲染进程事件推送：
    - `TRACE_SPAN_ENDED` / `TRACE_UPDATE`
    - `PERFORMANCE_METRICS` / `PERFORMANCE_ALERT` / `PERFORMANCE_ALERT_CLEARED`
17. 在 `src/main/index.ts` 中注册此 handler

### 步骤 5：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

1. 在 `window.sibylla` 命名空间下新增 `trace` 对象：
   ```typescript
   trace: {
     getTraceTree: (traceId: string) => ipcRenderer.invoke('trace:getTraceTree', traceId),
     query: (filter: TraceQueryFilter) => ipcRenderer.invoke('trace:query', filter),
     getRecentTraces: (limit: number) => ipcRenderer.invoke('trace:getRecent', limit),
     getStats: () => ipcRenderer.invoke('trace:getStats'),
     lockTrace: (traceId: string, reason?: string) => ipcRenderer.invoke('trace:lockTrace', traceId, reason),
     unlockTrace: (traceId: string) => ipcRenderer.invoke('trace:unlockTrace', traceId),
     previewExport: (traceIds: string[], customRules?: RedactionRule[]) => ipcRenderer.invoke('trace:previewExport', traceIds, customRules),
     export: (traceIds: string[], outputPath: string, options?: ExportOptions) => ipcRenderer.invoke('trace:export', traceIds, outputPath, options),
     import: (filePath: string) => ipcRenderer.invoke('trace:import', filePath),
     rebuildSnapshot: (traceId: string) => ipcRenderer.invoke('trace:rebuildSnapshot', traceId),
     rerun: (traceId: string) => ipcRenderer.invoke('trace:rerun', traceId),
     onTraceUpdate: (traceId: string, callback: () => void) => () => { /* ipcRenderer.on + return unsubscribe */ },
   }
   ```
2. 新增 `performance` 对象：
   ```typescript
   performance: {
     getMetrics: () => ipcRenderer.invoke('performance:getMetrics'),
     getAlerts: () => ipcRenderer.invoke('performance:getAlerts'),
     suppressAlert: (type: string, durationMs: number) => ipcRenderer.invoke('performance:suppressAlert', type, durationMs),
   }
   ```
3. 新增 `progress` 对象：
   ```typescript
   progress: {
     getSnapshot: () => ipcRenderer.invoke('progress:getSnapshot'),
     getTask: (id: string) => ipcRenderer.invoke('progress:getTask', id),
     editUserNote: (taskId: string, note: string) => ipcRenderer.invoke('progress:editUserNote', taskId, note),
     getArchive: (month: string) => ipcRenderer.invoke('progress:getArchive', month),
   }
   ```
4. 新增 `inspector` 对象：
   ```typescript
   inspector: {
     open: (traceId?: string) => { /* 打开 Trace Inspector 窗口/面板 */ },
   }
   ```

### 步骤 6：实现 traceStore（Zustand）

**文件：** `src/renderer/store/traceStore.ts`

1. 定义 `TraceState` 接口：
   - recentTraces: Array<{ traceId; startTime; spanCount }>
   - selectedTraceId: string | null
   - selectedSpanId: string | null
   - currentSpans: SerializedSpan[]
   - viewMode: 'flamegraph' | 'tree' | 'timeline' | 'perf'
   - compareTraceId: string | null
   - stats: { totalSpans; totalTraces; dbSizeBytes } | null
   - loading: boolean
   - error: string | null
2. 创建 `useTraceStore = create<TraceState & TraceActions>()((set, get) => ({...}))`
3. 实现 actions：
   - `fetchRecentTraces(limit)` → `window.sibylla.trace.getRecentTraces(limit)`
   - `selectTrace(traceId)` → set selectedTraceId + fetch spans
   - `fetchTraceTree(traceId)` → `window.sibylla.trace.getTraceTree(traceId)`
   - `selectSpan(spanId)` → set selectedSpanId
   - `setViewMode(mode)` → set viewMode
   - `setCompareTrace(traceId)` → set compareTraceId + fetch spans
   - `fetchStats()` → `window.sibylla.trace.getStats()`
   - `lockTrace(traceId)` → `window.sibylla.trace.lockTrace(traceId)`
   - `exportTrace(traceIds, path)` → `window.sibylla.trace.export(traceIds, path)`
   - `rebuildSnapshot(traceId)` → `window.sibylla.trace.rebuildSnapshot(traceId)`
   - `rerun(traceId)` → `window.sibylla.trace.rerun(traceId)`
4. 监听 IPC 事件 `TRACE_UPDATE` 刷新当前选中 Trace

### 步骤 7：实现 progressStore（Zustand）

**文件：** `src/renderer/store/progressStore.ts`

1. 定义 `ProgressState` 接口：
   - snapshot: ProgressSnapshot | null
   - loading: boolean
   - error: string | null
2. 创建 `useProgressStore = create<ProgressState & ProgressActions>()(...)`
3. 实现 actions：
   - `fetchSnapshot()` → `window.sibylla.progress.getSnapshot()`
   - `editUserNote(taskId, note)` → `window.sibylla.progress.editUserNote(taskId, note)`
   - `getArchive(month)` → `window.sibylla.progress.getArchive(month)`
4. 监听 IPC 事件 `PROGRESS_TASK_*` 实时更新 snapshot

### 步骤 8：实现 ExecutionTrace 对话气泡组件

**文件：** `src/renderer/components/conversation/ExecutionTrace.tsx`

1. 定义 `USER_VISIBLE_SPANS` 白名单常量：
   ```
   'context.assemble': { label: '读取上下文', icon: '📥', order: 1 }
   'ai.llm-call': { label: 'AI 思考', icon: '🧠', order: 2 }
   'harness.guardrail': { label: 'Guardrail 检查', icon: '🛡️', order: 3 }
   'harness.sensor': { label: 'Sensor 评估', icon: '📊', order: 4 }
   'harness.evaluator': { label: 'Evaluator 审查', icon: '⚖️', order: 5 }
   'tool.file-write': { label: '写入文件', icon: '💾', order: 6 }
   'tool.file-read': { label: '读取文件', icon: '📄', order: 7 }
   'memory.search': { label: '检索记忆', icon: '🧩', order: 8 }
   ```
2. Props：`{ messageId: string; traceId?: string }`
3. 状态：`expanded`、`spans`、`loading`
4. 未展开时：显示"🔍 展开执行轨迹"按钮
5. 展开时：
   - 调用 `window.sibylla.trace.getTraceTree(traceId)` 加载 Span
   - 调用 `filterAndGroupSpans()` 过滤和分组
   - 计算根 Span duration
   - 计算各 name 的中位数 duration
   - 渲染简化时间线：
     - 头部：`🔍 执行轨迹（用时 Xs）`
     - 每行：icon + label + duration + 附加信息
     - 异常耗时行橙色高亮
     - 失败行红色标记 + tooltip
   - 底部：`[查看完整 Trace →]` 按钮
6. 监听 `window.sibylla.onTraceUpdate(traceId, callback)` 自动刷新
7. 实现 `filterAndGroupSpans()` 辅助函数：
   - 按 USER_VISIBLE_SPANS 白名单过滤
   - 相邻同名 Span 合并为一组
   - 按 startTimeMs 排序
8. 实现 `computeMedianDurationsByName()` 辅助函数

### 步骤 9：实现 TraceInspector 主面板

**文件：** `src/renderer/components/inspector/TraceInspector.tsx`

1. Props：`{ initialTraceId?: string }`
2. 状态（从 traceStore 读取）：
   - selectedTraceId / selectedSpanId / viewMode / compareTraceId
3. 布局：三栏式
   - 左侧 `inspector-sidebar`：TraceList 组件
   - 中间 `inspector-main`：InspectorToolbar + 视图内容区
   - 右侧 `inspector-detail`：SpanDetailPane
   - 底部：SearchBar
4. 实现 `InspectorToolbar` 内联组件：
   - 视图切换按钮组（火焰图/树形/时间线/性能）
   - 对比模式按钮
   - 导出按钮
   - Trace 锁定按钮
5. 使用 `useTraceStore` 选择器获取状态和 actions

### 步骤 10：实现 TraceList 组件

**文件：** `src/renderer/components/inspector/TraceList.tsx`

1. Props：`{ selected; onSelect }`
2. 挂载时调用 `traceStore.fetchRecentTraces(100)`
3. 渲染列表：
   - 每条显示 traceId（截断）、开始时间、Span 数量
   - 选中项高亮
   - 搜索框过滤
4. 点击条目调用 `onSelect(traceId)`

### 步骤 11：实现 FlameGraph 组件

**文件：** `src/renderer/components/inspector/FlameGraph.tsx`

1. Props：`{ traceId; onSpanClick }`
2. 使用 Canvas 渲染（性能优化）
3. 挂载时从 traceStore 获取 spans
4. 渲染逻辑：
   - 构建 Span 树（按 parentSpanId 嵌套）
   - 横轴：时间线（rootSpan 的 startTime → endTime）
   - 纵轴：层级深度
   - 每个块：x 对应时间偏移，width 对应 duration 占比，y 对应层级
   - 颜色编码：status=error 红色，kind=ai-call 蓝色，kind=tool-call 绿色，其他灰色
   - 块上显示 span name（文字裁剪适应宽度）
5. 点击事件：hitTest 命中检测 → `onSpanClick(span.spanId)`
6. hover 事件：显示 tooltip（name + duration）

### 步骤 12：实现 SpanTreeView 组件

**文件：** `src/renderer/components/inspector/SpanTreeView.tsx`

1. Props：`{ traceId; onSpanClick }`
2. 构建嵌套树结构
3. 渲染为可折叠的树形列表
4. 每行显示：展开箭头（有子节点时）、icon（按 kind）、name、duration
5. 错误 Span 红色文字

### 步骤 13：实现 TimelineView 组件

**文件：** `src/renderer/components/inspector/TimelineView.tsx`

1. Props：`{ traceId; onSpanClick }`
2. 纯时间顺序列表（不嵌套）
3. 每行显示：时间戳、icon、name、duration、status
4. 错误 Span 红色高亮

### 步骤 14：实现 PerformanceStats 组件

**文件：** `src/renderer/components/inspector/PerformanceStats.tsx`

1. Props：`{ traceId }`
2. 按 span name 聚合统计：
   - 调用次数、平均耗时、P95 耗时、最大耗时、错误次数
3. 可排序列表格
4. 颜色编码：高耗时红色、正常绿色

### 步骤 15：实现 SpanDetailPane 组件

**文件：** `src/renderer/components/inspector/SpanDetailPane.tsx`

1. Props：`{ spanId }`
2. 从 traceStore.currentSpans 中查找 Span
3. 显示区域：
   - 概览：name、kind、status、duration、时间
   - 父子链：parentSpanId → 子 Span 列表（可点击跳转）
   - Attributes：键值表格（脱敏值标红）
   - Events：时间线列表
   - Context：conversationId、taskId、workspaceId

### 步骤 16：实现 SearchBar 组件

**文件：** `src/renderer/components/inspector/SearchBar.tsx`

1. Props：`{ traceId }`
2. 搜索框输入 → 遍历 currentSpans 的 attributes 和 events.attributes
3. 匹配项高亮，显示匹配数量
4. 点击结果跳转到对应 Span

### 步骤 17：实现 ExportDialog 组件

**文件：** `src/renderer/components/inspector/ExportDialog.tsx`

1. 模态对话框
2. 步骤 1：预检——调用 `trace.previewExport(traceIds)` 显示脱敏报告
3. 步骤 2：用户添加自定义规则（动态表单）
4. 步骤 3：确认导出——选择输出路径，调用 `trace.export()`
5. 进度指示和成功/失败反馈

### 步骤 18：实现 ProgressPanel 组件

**文件：** `src/renderer/components/progress/ProgressPanel.tsx`

1. 使用 `useProgressStore`
2. 挂载时调用 `fetchSnapshot()`
3. 三区域渲染：
   - 🔄 进行中：遍历 snapshot.active，渲染 TaskCard
   - ✅ 已完成：遍历 snapshot.completedRecent，渲染 TaskCard
   - 📋 排队中：遍历 snapshot.queued，渲染 TaskCard
4. 监听 IPC 事件实时更新
5. 进行中任务每秒刷新耗时显示

### 步骤 19：实现 TaskCard 组件

**文件：** `src/renderer/components/progress/TaskCard.tsx`

1. Props：`{ task: TaskRecord }`
2. 显示：ID、标题、状态、模式、耗时
3. Trace 链接：点击调用 `window.sibylla.inspector.open(task.traceId)`
4. 进行中任务：显示 checklist 进度（TaskChecklist 子组件）
5. 已完成任务：显示结果摘要或失败原因

### 步骤 20：StudioAIPanel 集成

**文件：** `src/renderer/components/studio/StudioAIPanel.tsx`（扩展）

1. AI 消息气泡新增 `traceId` prop
2. 在 AI 消息气泡下方挂载 `<ExecutionTrace messageId={msg.id} traceId={msg.traceId} />`
3. 从 `AIStreamEnd` 事件中提取 `traceId` 存入消息对象

### 步骤 21：键盘快捷键注册

1. 在渲染进程注册 `Ctrl+Shift+T`（macOS `Cmd+Shift+T`）快捷键
2. 打开 Trace Inspector 面板（新窗口或侧面板）
3. 遵循 Electron 全局快捷键最佳实践

### 步骤 22：主进程初始化

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 PerformanceMonitor / ReplayEngine / TraceExporter：
   ```typescript
   const performanceMonitor = new PerformanceMonitor(
     traceStore, perfConfig, appEventBus, logger
   )
   performanceMonitor.start()

   const replayEngine = new ReplayEngine(
     traceStore, memoryManager, fileManager, aiGateway, tracer, logger
   )

   const traceExporter = new TraceExporter(traceStore, logger)
   ```
2. 注册 trace IPC handler
3. 注册 Preload API 扩展
4. 在 `onWorkspaceClosed` 中：`performanceMonitor.stop()`

## 测试计划

### 单元测试文件结构

```
tests/trace/
├── performance-monitor.test.ts    ← 性能监控测试
├── replay-engine.test.ts         ← 回放引擎测试
└── trace-exporter.test.ts        ← 导出脱敏测试

tests/progress/
└── (已在 TASK028 中覆盖)

tests/renderer/
├── execution-trace.test.tsx       ← 执行轨迹组件测试
├── trace-inspector.test.tsx       ← Inspector 集成测试
└── progress-panel.test.tsx        ← Progress 面板测试
```

### performance-monitor.test.ts 测试用例

1. **computeMetrics** — 正确计算 LLM 调用统计
2. **slow call detection** — 慢调用 > 阈值标记
3. **error rate detection** — 错误率 > 5% 标记
4. **token spike detection** — Token > 30K 标记
5. **consecutive alert** — 连续 3 窗口触发告警
6. **suppress alert** — 屏蔽后不触发告警
7. **auto-clear alert** — 连续 5 窗口恢复后清除告警
8. **estimated cost** — 告警含预估美元成本

### replay-engine.test.ts 测试用例

1. **rebuild snapshot** — 正确提取 prompt / context / memory / config
2. **approximate memory** — 无精确快照时标记 isApproximate
3. **deleted file** — 文件不存在时替换为 placeholder
4. **rerun** — 创建新 Trace，含 replay.of 属性
5. **related reruns** — 查询原 Trace 的所有回放

### trace-exporter.test.ts 测试用例

1. **preview redaction** — 预检列出所有将脱敏的字段
2. **default rules** — 默认规则覆盖 api_key / token / email / user_path
3. **custom rules** — 自定义规则生效
4. **export JSON** — 导出文件不含原始敏感值
5. **import** — 导入后 traceId/spanId 带 imported- 前缀
6. **no file contents** — 默认不嵌入文件内容