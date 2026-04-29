# PHASE1-TASK029: 可观测性 UI 与性能监控 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task029_observability-ui-performance.md](../specs/tasks/phase1/phase1-task029_observability-ui-performance.md)
> 创建日期：2026-04-21
> 最后更新：2026-04-21

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK029 |
| **任务标题** | 可观测性 UI 与性能监控 |
| **所属阶段** | Phase 1 - Trace 系统、任务台账与可观测性 (Sprint 3.3) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | TASK027 + TASK028 + StudioAIPanel |

### 1.1 目标

构建 Sprint 3.3 的用户可见层——实现对话气泡执行轨迹视图、Trace Inspector 开发者面板、Progress 任务面板、PerformanceMonitor 性能监控与阈值预警、ReplayEngine 回放与上下文重建、TraceExporter 导出与脱敏。将 TASK027/028 的后端能力完整暴露给用户。

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| PerformanceMonitor | `src/main/services/trace/performance-monitor.ts` | 性能聚合与告警 |
| ReplayEngine | `src/main/services/trace/replay-engine.ts` | 回放与快照重建 |
| TraceExporter | `src/main/services/trace/trace-exporter.ts` | 导出与脱敏 |
| IPC Handler | `src/main/ipc/handlers/trace.handler.ts` | Trace 查询/导出/回放通道 |
| traceStore | `src/renderer/store/traceStore.ts` | Trace Inspector 状态 |
| progressStore | `src/renderer/store/progressStore.ts` | Progress 面板状态 |
| ExecutionTrace | `src/renderer/components/conversation/ExecutionTrace.tsx` | 对话气泡执行轨迹 |
| TraceInspector 套件 | `src/renderer/components/inspector/` (9 文件) | 开发者面板 |
| ProgressPanel 套件 | `src/renderer/components/progress/` (3 文件) | 任务面板 |
| Preload API 扩展 | `src/preload/index.ts` | trace/performance/progress 方法 |
| shared/types 扩展 | `src/shared/types.ts` | Performance 共享类型 |
| 主进程初始化 | `src/main/index.ts` | 服务生命周期 + 事件推送 |
| StudioAIPanel 集成 | `src/renderer/components/studio/StudioAIPanel.tsx` | traceId + ExecutionTrace 挂载 |
| 单元测试 | `tests/trace/*.test.ts` + `tests/renderer/*.test.tsx` | 主进程 + 渲染进程测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；渲染进程不得直接访问文件系统；等待 >2s 需进度反馈；原子写入 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程 IPC 隔离；better-sqlite3 主进程专用 | 架构约束 |
| `specs/design/data-and-api.md` | IPC 通道命名规范；Preload API 设计 | IPC 设计 |
| `specs/design/ui-ux-design.md` | 色彩体系（主色 #6366F1）、布局结构、交互规范 | UI 设计 |
| `specs/requirements/phase1/sprint3.3-trace.md` | 需求 3.3.5-3.3.9 完整技术规格 | 验收标准 |
| `specs/tasks/phase1/phase1-task029_observability-ui-performance.md` | 22 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Trace/Performance IPC 通道注册；Preload API 扩展；事件推送注册 | trace.handler.ts + preload + main/index.ts |
| `zustand-state-management` | traceStore / progressStore 设计；selector 优化；IPC 封装在 action 中 | traceStore.ts + progressStore.ts |
| `typescript-strict-mode` | 严格类型定义；禁止 any；PerformanceMetrics/Alert 联合类型 | shared/types.ts + 全部实现 |
| `frontend-design` | TraceInspector / ExecutionTrace / ProgressPanel UI 设计与样式 | 全部渲染进程组件 |
| `llm-streaming-integration` | ReplayEngine.rerun 的 AI 调用流式处理 | replay-engine.ts |

### 2.3 前置代码依赖（TASK027/028 产物 + 现有模块）

| 模块 | 文件 | 复用/改造方式 |
|------|------|-------------|
| `TraceStore` | `src/main/services/trace/trace-store.ts` | IPC Handler 委托查询；PerformanceMonitor 查询 Span |
| `Tracer` | `src/main/services/trace/tracer.ts` | ReplayEngine.rerun 使用 withSpan 包裹 |
| `SerializedSpan` / `TraceQueryFilter` | `src/main/services/trace/types.ts` | 渲染进程 + IPC 类型基础 |
| `SerializedSpanShared` / `TraceQueryFilterShared` | `src/shared/types.ts:1733-1773` | IPC 边界序列化类型 |
| `AppEventBus` | `src/main/services/event-bus.ts` | PerformanceMonitor 事件发射；main/index.ts 推送 |
| `ProgressLedger` + `ProgressHandler` | `src/main/services/progress/` + `src/main/ipc/handlers/progress.ts` | progressStore 依赖已有通道 |
| `TaskRecord` / `ProgressSnapshot` | `src/main/services/progress/types.ts` | progressStore + ProgressPanel 类型 |
| `TaskRecordShared` / `ProgressSnapshotShared` | `src/shared/types.ts:1775-1813` | IPC 边界序列化类型 |
| `IPC_CHANNELS` (TRACE_*/PERFORMANCE_*) | `src/shared/types.ts:490-537` | 通道常量已定义，Handler 需注册 |
| `IPCChannelMap` | `src/shared/types.ts` | 类型安全注册映射 |
| `IpcHandler` 基类 | `src/main/ipc/handler.ts` | safeHandle + wrapResponse + wrapError |
| `StudioAIPanel` | `src/renderer/components/studio/StudioAIPanel.tsx` | 新增 traceId prop + ExecutionTrace 挂载 |
| `Preload API` | `src/preload/index.ts` | 新增 trace/performance/progress 命名空间 |
| `MemoryManager` | `src/main/services/memory-manager.ts` | ReplayEngine 调用 getSnapshotAt() |
| `FileManager` | `src/main/services/file-manager.ts` | ReplayEngine 读取文件；TraceExporter 写出 |
| `AIGatewayClient` | `src/main/services/ai/ai-gateway.ts` (推测) | ReplayEngine.rerun 发送 AI 请求 |
| `harnessStore` | `src/renderer/store/harnessStore.ts` | 参照 Zustand 模式 |
| `main/index.ts` | `src/main/index.ts` | 扩展 workspace 生命周期 + 事件推送 |

### 2.4 IPC 通道清单（TASK029 新增注册）

**Renderer→Main 调用通道（已定义常量，需注册 Handler）：**

| 通道常量 | 通道名 | Handler 方法 | 返回类型 |
|---------|--------|-------------|---------|
| `TRACE_GET_TREE` | `trace:getTraceTree` | `handleGetTraceTree` | `SerializedSpanShared[]` |
| `TRACE_QUERY` | `trace:query` | `handleQuery` | `SerializedSpanShared[]` |
| `TRACE_GET_RECENT` | `trace:getRecent` | `handleGetRecent` | `RecentTraceInfo[]` |
| `TRACE_GET_STATS` | `trace:getStats` | `handleGetStats` | `TraceStatsShared` |
| `TRACE_LOCK` | `trace:lockTrace` | `handleLockTrace` | `void` |
| `TRACE_UNLOCK` | `trace:unlockTrace` | `handleUnlockTrace` | `void` |
| `TRACE_CLEANUP` | `trace:cleanupNow` | `handleCleanup` | `{ deleted: number }` |
| `TRACE_PREVIEW_EXPORT` | `trace:previewExport` | `handlePreviewExport` | `ExportPreviewShared` |
| `TRACE_EXPORT` | `trace:export` | `handleExport` | `void` |
| `TRACE_IMPORT` | `trace:import` | `handleImport` | `{ traceIds: string[] }` |
| `TRACE_REBUILD_SNAPSHOT` | `trace:rebuildSnapshot` | `handleRebuildSnapshot` | `TraceSnapshotShared` |
| `TRACE_RERUN` | `trace:rerun` | `handleRerun` | `{ newTraceId: string }` |
| `PERFORMANCE_GET_METRICS` | `performance:getMetrics` | `handleGetMetrics` | `PerformanceMetricsShared` |
| `PERFORMANCE_GET_ALERTS` | `performance:getAlerts` | `handleGetAlerts` | `PerformanceAlertShared[]` |
| `PERFORMANCE_SUPPRESS` | `performance:suppressAlert` | `handleSuppressAlert` | `void` |

**Main→Renderer 推送事件（需在 main/index.ts 中注册）：**

| 事件 | 通道名 | 当前状态 |
|------|--------|---------|
| `TRACE_SPAN_ENDED` | `trace:spanEnded` | **未推送**，需注册 |
| `TRACE_UPDATE` | `trace:update` | **未推送**，需注册 |
| `PERFORMANCE_METRICS` | `performance:metrics` | **未推送**，需注册 |
| `PERFORMANCE_ALERT` | `performance:alert` | **未推送**，需注册 |
| `PERFORMANCE_ALERT_CLEARED` | `performance:alertCleared` | **未推送**，需注册 |

---

## 三、现有代码盘点与差距分析

### 3.1 TraceStore 现状

- `getTraceTree(traceId)` → `SerializedSpan[]` ✅
- `query(filter)` → `SerializedSpan[]` ✅
- `getRecentTraces(limit)` → 返回类型需确认 ✅
- `getStats()` → `{ totalSpans, totalTraces, dbSizeBytes }` ✅
- `lockTrace / unlockTrace / cleanup` ✅
- `getMultipleTraces(traceIds)` → `SerializedSpan[]` ✅
- `writeBatch` ✅

**缺口：** 无 IPC Handler 桥接到渲染进程。

### 3.2 AppEventBus 现状

已有事件发射方法：
- `emitSpanEnded(span: SerializedSpan)` ✅
- `emitPerformanceMetrics(metrics: unknown)` ⚠️ 参数类型为 `unknown`
- `emitPerformanceAlert(alert: unknown)` ⚠️ 参数类型为 `unknown`
- `emitPerformanceAlertCleared(payload: { type: string })` ✅

**缺口：** performance 事件参数类型需从 `unknown` 改为具体类型；main/index.ts 未推送 `trace:span-ended` 和 `performance:*` 事件到渲染进程。

### 3.3 shared/types.ts 现状

- `SerializedSpanShared` / `TraceQueryFilterShared` ✅
- `TaskRecordShared` / `ProgressSnapshotShared` ✅
- `PerformanceMetrics` / `PerformanceAlert` 共享类型 ❌ **不存在**
- IPC 通道常量全部已定义 ✅
- IPCChannelMap 类型映射已定义 ✅
- Preload `ElectronAPI` 接口 **不含** trace/performance/progress ❌
- `ALLOWED_CHANNELS` 列表 **不含** trace/performance/progress ❌

### 3.4 渲染进程现状

- `StudioAIPanel.tsx` 存在 (386 行)，无 traceId prop / ExecutionTrace 挂载点 ❌
- 13 个 Zustand store 存在，无 traceStore / progressStore ❌
- 无 `inspector/` / `progress/` / `conversation/` (ExecutionTrace) 组件目录 ❌

### 3.5 主进程现状

- `PerformanceMonitor` 不存在 ❌
- `ReplayEngine` 不存在 ❌
- `TraceExporter` 不存在 ❌
- `TraceHandler` (IPC) 不存在 ❌
- `main/index.ts` 未创建/注册上述服务 ❌

### 3.6 不存在的文件/目录

| 文件 | 状态 |
|------|------|
| `src/main/services/trace/performance-monitor.ts` | **不存在**，需新建 |
| `src/main/services/trace/replay-engine.ts` | **不存在**，需新建 |
| `src/main/services/trace/trace-exporter.ts` | **不存在**，需新建 |
| `src/main/ipc/handlers/trace.handler.ts` | **不存在**，需新建 |
| `src/renderer/store/traceStore.ts` | **不存在**，需新建 |
| `src/renderer/store/progressStore.ts` | **不存在**，需新建 |
| `src/renderer/components/conversation/ExecutionTrace.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/` (目录) | **不存在**，需创建 |
| `src/renderer/components/inspector/TraceInspector.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/TraceList.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/FlameGraph.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/SpanTreeView.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/TimelineView.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/PerformanceStats.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/SpanDetailPane.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/SearchBar.tsx` | **不存在**，需新建 |
| `src/renderer/components/inspector/ExportDialog.tsx` | **不存在**，需新建 |
| `src/renderer/components/progress/ProgressPanel.tsx` | **不存在**，需新建 |
| `src/renderer/components/progress/TaskCard.tsx` | **不存在**，需新建 |
| `src/renderer/components/progress/TaskChecklist.tsx` | **不存在**，需新建 |
| `tests/trace/performance-monitor.test.ts` | **不存在**，需新建 |
| `tests/trace/replay-engine.test.ts` | **不存在**，需新建 |
| `tests/trace/trace-exporter.test.ts` | **不存在**，需新建 |

---

## 四、分步实施计划

### 阶段 A：主进程服务层（预计 2 工作日）

> 产出 PerformanceMonitor / ReplayEngine / TraceExporter 三个独立服务。

#### 步骤 A1：定义 Performance 共享类型

**文件：** `sibylla-desktop/src/shared/types.ts`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A1.1 | 定义 `PerformanceMetricsShared` 接口 | windowStart/End、llmCallCount/AvgDurationMs/P95DurationMs、errorRate、totalTokens、estimatedCostUSD、degradationCount、activeSpanCount |
| A1.2 | 定义 `PerformanceAlertShared` 接口 | id、type(slow_call/token_spike/error_rate/degradation/leak)、severity(info/warn/critical)、message、metrics(部分)、firstSeenAt、consecutiveWindows |
| A1.3 | 定义 `PerformanceConfigShared` 接口 | 各阈值配置 |
| A1.4 | 定义 `TraceSnapshotShared` 接口 | traceId、reconstructedAt、originalTimestamp、isApproximate、approximationReasons、prompt/contextFiles/memorySnapshot/modelConfig |
| A1.5 | 定义 `RedactionRuleShared` 接口 | id、keyPattern(序列化为 string)、valuePattern(序列化为 string)、reason |
| A1.6 | 定义 `ExportPreviewShared` 接口 | spans + redactionReport |
| A1.7 | 定义 `RecentTraceInfoShared` 接口 | traceId、startTime、spanCount |
| A1.8 | 定义 `TraceStatsShared` 接口 | totalSpans、totalTraces、dbSizeBytes |
| A1.9 | 补全 IPCChannelMap 中 performance 相关返回类型 | 替换 `unknown` |

#### 步骤 A2：实现 PerformanceMonitor

**文件：** `sibylla-desktop/src/main/services/trace/performance-monitor.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A2.1 | 定义 `PerformanceMetrics` 内部接口 | 同 A1.1 但主进程专用 |
| A2.2 | 定义 `PerformanceAlert` 内部接口 | 同 A1.2 但主进程专用 |
| A2.3 | 定义 `PerformanceConfig` 内部接口 | slowCallThresholdMs(10000) / tokenSpikeThreshold(30000) / errorRateThreshold(0.05) / degradationThreshold(3) / activeSpanLeakThreshold(100) / modelPricingConfig |
| A2.4 | 定义 `AlertState` 内部接口 | consecutiveCount / wasAlerting |
| A2.5 | 构造函数注入 traceStore / config / eventBus / logger | |
| A2.6 | 内部状态：alertStates Map / suppressions Map / aggregationInterval? | |
| A2.7 | 实现 `start()` | setInterval 60s 调用 aggregateAndAlert() |
| A2.8 | 实现 `stop()` | 清除 interval |
| A2.9 | 实现 `aggregateAndAlert()` | computeMetrics → emit → 遍历 alertCheckers → 更新 AlertState → 连续 3 窗口 emit alert → 连续 5 窗口恢复 emit cleared |
| A2.10 | 实现 `computeMetrics()` | 查询 TraceStore 15min 窗口 ai-call Span → 计算 LLM 统计 / errorRate / totalTokens / estimatedCost / degradationCount / activeSpanCount |
| A2.11 | 实现 `alertCheckers()` | 返回 slow_call / token_spike / error_rate / degradation / leak 五个 Checker |
| A2.12 | 实现 `suppress(alertType, durationMs)` | suppressions.set + 持久化到 config |
| A2.13 | 实现 `isSuppressed(alertType)` | 检查 suppressions 未过期 |
| A2.14 | 实现 `getMetrics()` | 返回最近一次 computeMetrics 结果 |
| A2.15 | 实现 `getAlerts()` | 返回当前活跃告警列表 |
| A2.16 | 实现 `toShared()` 转换方法 | 主进程内部类型 → Shared 类型 |

#### 步骤 A3：实现 ReplayEngine

**文件：** `sibylla-desktop/src/main/services/trace/replay-engine.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A3.1 | 定义 `TraceSnapshot` 内部接口 | traceId / reconstructedAt / originalTimestamp / isApproximate / approximationReasons / prompt / contextFiles / memorySnapshot / modelConfig |
| A3.2 | 构造函数注入 traceStore / memoryManager / fileManager / aiGateway / tracer / logger | |
| A3.3 | 实现 `rebuildSnapshot(traceId)` | 查询 Span 树 → 找 llm Span → 提取 prompt/context/modelConfig → 重建 contextFiles → 获取 memorySnapshot → 返回 |
| A3.4 | 实现 `reconstructContextFiles(paths, ts, reasons)` | 文件存在：content；不存在：placeholder + 追加 reason |
| A3.5 | 实现 `rerun(traceId)` | rebuildSnapshot → tracer.withSpan('ai.llm-call.rerun') → 设置 replay.of 等属性 → aiGateway.chat() → 返回 newTraceId |
| A3.6 | 实现 `getRelatedReruns(traceId)` | traceStore.query({ attributeFilters: { 'replay.of': traceId } }) |
| A3.7 | 实现 `toShared()` 转换方法 | |

#### 步骤 A4：实现 TraceExporter

**文件：** `sibylla-desktop/src/main/services/trace/trace-exporter.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A4.1 | 定义 `RedactionRule` 内部接口 | id / keyPattern? / valuePattern? / reason |
| A4.2 | 定义 `TraceExportBundle` 内部接口 | exportVersion=1 / exportedAt / sibyllaVersion / workspaceIdAnonymized / redactionRules / spans / checksum |
| A4.3 | 定义 `DEFAULT_RULES` 常量 | api_key / token / email / user_path / home_linux / user_windows |
| A4.4 | 构造函数注入 traceStore / logger | |
| A4.5 | 实现 `preview(traceIds, customRules?)` | 合并规则 → 查询 spans → redactSpan → 返回 { spans, redactionReport } |
| A4.6 | 实现 `redactSpan(span, rules, report)` 私有 | 遍历 attributes + events.attributes → keyPattern/valuePattern 匹配 → 替换 [REDACTED] → 记录 report |
| A4.7 | 实现 `export(traceIds, outputPath, customRules?, options?)` | preview → 构建 bundle → computeChecksum → writeFile |
| A4.8 | 实现 `import(filePath)` | 读取 → 校验 version → 添加 imported- 前缀 → writeBatch → 返回 traceIds |
| A4.9 | 实现 `anonymizeWorkspaceId()` 私有 | hash 替换 |
| A4.10 | 实现 `computeChecksum(spans)` 私有 | 序列化后简单 checksum |
| A4.11 | 实现 `toShared()` / `fromSharedRule()` 转换方法 | RegExp ↔ string 序列化 |

---

### 阶段 B：IPC Handler + Preload API（预计 1 工作日）

> 产出类型安全的 IPC 桥接层。

#### 步骤 B1：实现 TraceHandler

**文件：** `sibylla-desktop/src/main/ipc/handlers/trace.handler.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| B1.1 | 创建 `TraceHandler` 继承 `IpcHandler` | namespace = 'trace' |
| B1.2 | 构造函数注入 traceStore / traceExporter / replayEngine / performanceMonitor | |
| B1.3 | 注册 `TRACE_GET_TREE` | traceStore.getTraceTree → toShared[] |
| B1.4 | 注册 `TRACE_QUERY` | traceStore.query → toShared[] |
| B1.5 | 注册 `TRACE_GET_RECENT` | traceStore.getRecentTraces → toShared[] |
| B1.6 | 注册 `TRACE_GET_STATS` | traceStore.getStats → toShared |
| B1.7 | 注册 `TRACE_LOCK / TRACE_UNLOCK` | traceStore.lockTrace / unlockTrace |
| B1.8 | 注册 `TRACE_CLEANUP` | traceStore.cleanup → { deleted } |
| B1.9 | 注册 `TRACE_PREVIEW_EXPORT` | traceExporter.preview → toShared |
| B1.10 | 注册 `TRACE_EXPORT` | traceExporter.export |
| B1.11 | 注册 `TRACE_IMPORT` | traceExporter.import |
| B1.12 | 注册 `TRACE_REBUILD_SNAPSHOT` | replayEngine.rebuildSnapshot → toShared |
| B1.13 | 注册 `TRACE_RERUN` | replayEngine.rerun |
| B1.14 | 注册 `PERFORMANCE_GET_METRICS` | performanceMonitor.getMetrics → toShared |
| B1.15 | 注册 `PERFORMANCE_GET_ALERTS` | performanceMonitor.getAlerts → toShared[] |
| B1.16 | 注册 `PERFORMANCE_SUPPRESS` | performanceMonitor.suppress |
| B1.17 | 内部 `toShared()` 转换方法 | SerializedSpan → SerializedSpanShared 等 |

#### 步骤 B2：扩展 Preload API

**文件：** `sibylla-desktop/src/preload/index.ts`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| B2.1 | 新增 `trace` 命名空间到 ElectronAPI | getTraceTree / query / getRecentTraces / getStats / lockTrace / unlockTrace / previewExport / exportTrace / importTrace / rebuildSnapshot / rerun / onTraceUpdate |
| B2.2 | 新增 `performance` 命名空间 | getMetrics / getAlerts / suppressAlert |
| B2.3 | 新增 `progress` 命名空间 | getSnapshot / getTask / editUserNote / getArchive |
| B2.4 | 新增 `inspector` 命名空间 | open(traceId?) |
| B2.5 | 追加所有新通道到 `ALLOWED_CHANNELS` | TRACE_*/PERFORMANCE_*/PROGRESS_* |
| B2.6 | 实现 `onTraceUpdate` 事件监听 | ipcRenderer.on + 返回 unsubscribe 函数 |
| B2.7 | 实现 `onPerformanceAlert` 事件监听 | 同上模式 |
| B2.8 | 实现 `onProgressEvent` 事件监听 | 同上模式 |

#### 步骤 B3：更新 AppEventBus 类型

**文件：** `sibylla-desktop/src/main/services/event-bus.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| B3.1 | `emitPerformanceMetrics` 参数改为 `PerformanceMetrics` | 替换 unknown |
| B3.2 | `emitPerformanceAlert` 参数改为 `PerformanceAlert` | 替换 unknown |
| B3.3 | 新增 `emitTraceUpdate(traceId: string)` | 主动推送 trace 更新 |

---

### 阶段 C：主进程初始化与事件推送（预计 0.5 工作日）

> 产出完整的生命周期管理和跨进程事件桥接。

#### 步骤 C1：主进程初始化

**文件：** `sibylla-desktop/src/main/index.ts`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C1.1 | onWorkspaceOpened 创建 PerformanceMonitor | new PerformanceMonitor(traceStore, perfConfig, appEventBus, logger) → start() |
| C1.2 | 创建 ReplayEngine | new ReplayEngine(traceStore, memoryManager, fileManager, aiGateway, tracer, logger) |
| C1.3 | 创建 TraceExporter | new TraceExporter(traceStore, logger) |
| C1.4 | 注册 TraceHandler | ipcManager.registerHandler(new TraceHandler(traceStore, traceExporter, replayEngine, performanceMonitor)) |
| C1.5 | onWorkspaceClosed → performanceMonitor.stop() | 清理 interval |
| C1.6 | will-quit 补充清理 | 确保性能监控停止 |

#### 步骤 C2：事件推送注册

**文件：** `sibylla-desktop/src/main/index.ts`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C2.1 | 注册 `trace:span-ended` 推送 | appEventBus.on → webContents.send('trace:spanEnded', toShared(span)) |
| C2.2 | 注册 `trace:update` 推送 | appEventBus.on → webContents.send('trace:update', traceId) |
| C2.3 | 注册 `performance:metrics` 推送 | appEventBus.on → webContents.send('performance:metrics', toShared(metrics)) |
| C2.4 | 注册 `performance:alert` 推送 | appEventBus.on → webContents.send('performance:alert', toShared(alert)) |
| C2.5 | 注册 `performance:alert-cleared` 推送 | appEventBus.on → webContents.send('performance:alertCleared', payload) |
| C2.6 | 已有 progress 事件推送确认 | progress:* 事件已在 TASK028 中注册 |

---

### 阶段 D：渲染进程 Zustand Store（预计 0.5 工作日）

> 产出 traceStore 和 progressStore。

#### 步骤 D1：实现 traceStore

**文件：** `sibylla-desktop/src/renderer/store/traceStore.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D1.1 | 定义 `TraceState` 接口 | recentTraces / selectedTraceId / selectedSpanId / currentSpans / viewMode / compareTraceId / stats / loading / error |
| D1.2 | 创建 `useTraceStore = create<TraceState & TraceActions>()(...)` | |
| D1.3 | 实现 `fetchRecentTraces(limit)` | window.sibylla.trace.getRecentTraces → set recentTraces |
| D1.4 | 实现 `selectTrace(traceId)` | set selectedTraceId + fetchTraceTree |
| D1.5 | 实现 `fetchTraceTree(traceId)` | window.sibylla.trace.getTraceTree → set currentSpans |
| D1.6 | 实现 `selectSpan(spanId)` | set selectedSpanId |
| D1.7 | 实现 `setViewMode(mode)` | set viewMode |
| D1.8 | 实现 `setCompareTrace(traceId)` | set compareTraceId + fetchTraceTree |
| D1.9 | 实现 `fetchStats()` | window.sibylla.trace.getStats → set stats |
| D1.10 | 实现 `lockTrace(traceId)` | window.sibylla.trace.lockTrace |
| D1.11 | 实现 `exportTrace(traceIds, path, rules?)` | window.sibylla.trace.exportTrace |
| D1.12 | 实现 `rebuildSnapshot(traceId)` | window.sibylla.trace.rebuildSnapshot |
| D1.13 | 实现 `rerun(traceId)` | window.sibylla.trace.rerun |
| D1.14 | 监听 IPC 事件 `trace:update` 自动刷新当前选中 Trace | useEffect + onTraceUpdate |

#### 步骤 D2：实现 progressStore

**文件：** `sibylla-desktop/src/renderer/store/progressStore.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D2.1 | 定义 `ProgressState` 接口 | snapshot / loading / error |
| D2.2 | 创建 `useProgressStore = create<ProgressState & ProgressActions>()(...)` | |
| D2.3 | 实现 `fetchSnapshot()` | window.sibylla.progress.getSnapshot → set snapshot |
| D2.4 | 实现 `editUserNote(taskId, note)` | window.sibylla.progress.editUserNote |
| D2.5 | 实现 `getArchive(month)` | window.sibylla.progress.getArchive |
| D2.6 | 监听 IPC 事件 `progress:task*` 实时更新 snapshot | onProgressEvent |

---

### 阶段 E：ExecutionTrace 对话气泡组件（预计 0.5 工作日）

> 产出用户级简化执行轨迹视图。

#### 步骤 E1：实现 ExecutionTrace

**文件：** `sibylla-desktop/src/renderer/components/conversation/ExecutionTrace.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E1.1 | 定义 `USER_VISIBLE_SPANS` 白名单常量 | context.assemble / ai.llm-call / harness.guardrail / harness.sensor / harness.evaluator / tool.file-write / tool.file-read / memory.search — 各含 label/icon/order |
| E1.2 | Props: `{ messageId: string; traceId?: string }` | |
| E1.3 | 状态：expanded / spans / loading | |
| E1.4 | 未展开渲染：🔍 展开执行轨迹按钮 | |
| E1.5 | 展开加载逻辑：调用 window.sibylla.trace.getTraceTree | |
| E1.6 | filterAndGroupSpans() 辅助函数 | 白名单过滤 → 相邻同名合并 → startTimeMs 排序 |
| E1.7 | computeMedianDurationsByName() 辅助函数 | 按 name 分组计算中位数 |
| E1.8 | 渲染简化时间线：头部/行/底部 | 🔍 执行轨迹（用时 Xs）→ 各行 icon+label+duration → [查看完整 Trace →] |
| E1.9 | 异常耗时行橙色高亮 | duration > 同名中位数 3 倍 |
| E1.10 | 失败行红色标记 + hover tooltip | status=error |
| E1.11 | Span 行点击 → 属性详情 popover | |
| E1.12 | "查看完整 Trace" → window.sibylla.inspector.open(traceId) | |
| E1.13 | 监听 onTraceUpdate 自动刷新 | Trace 仍在写入时 |

---

### 阶段 F：TraceInspector 套件（预计 1.5 工作日）

> 产出完整的开发者面板。

#### 步骤 F1：实现 TraceInspector 主面板

**文件：** `sibylla-desktop/src/renderer/components/inspector/TraceInspector.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F1.1 | Props: `{ initialTraceId?: string }` | |
| F1.2 | 使用 useTraceStore 选择器 | selectedTraceId / selectedSpanId / viewMode / compareTraceId |
| F1.3 | 三栏布局：inspector-sidebar / inspector-main / inspector-detail | |
| F1.4 | InspectorToolbar 内联组件 | 视图切换按钮组 / 对比模式 / 导出 / Trace 锁定 |
| F1.5 | 底部 SearchBar | |

#### 步骤 F2：实现 TraceList

**文件：** `sibylla-desktop/src/renderer/components/inspector/TraceList.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F2.1 | Props: `{ selected; onSelect }` | |
| F2.2 | 挂载时 fetchRecentTraces(100) | |
| F2.3 | 渲染列表：traceId 截断 / 开始时间 / Span 数量 | |
| F2.4 | 搜索框过滤 | |
| F2.5 | 选中项高亮 | |

#### 步骤 F3：实现 FlameGraph

**文件：** `sibylla-desktop/src/renderer/components/inspector/FlameGraph.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F3.1 | Props: `{ traceId; onSpanClick }` | |
| F3.2 | Canvas 渲染 | 性能优化，避免 DOM 开销 |
| F3.3 | 构建 Span 树（按 parentSpanId 嵌套） | |
| F3.4 | 横轴时间线 / 纵轴层级 | rootSpan startTime→endTime |
| F3.5 | 块宽度 = duration 占比 / 块 y = 层级 | |
| F3.6 | 颜色编码 | error→红 / ai-call→蓝 / tool-call→绿 / 其他→灰 |
| F3.7 | 块上显示 span name | 文字裁剪适应宽度 |
| F3.8 | hitTest 点击 → onSpanClick | |
| F3.9 | hover tooltip | name + duration |

#### 步骤 F4：实现 SpanTreeView

**文件：** `sibylla-desktop/src/renderer/components/inspector/SpanTreeView.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F4.1 | Props: `{ traceId; onSpanClick }` | |
| F4.2 | 构建嵌套树结构 | 按 parentSpanId 递归 |
| F4.3 | 可折叠树形列表 | 展开箭头 |
| F4.4 | 每行：展开箭头 / icon(kind) / name / duration | |
| F4.5 | 错误 Span 红色文字 | |

#### 步骤 F5：实现 TimelineView

**文件：** `sibylla-desktop/src/renderer/components/inspector/TimelineView.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F5.1 | Props: `{ traceId; onSpanClick }` | |
| F5.2 | 纯时间顺序列表（不嵌套） | |
| F5.3 | 每行：时间戳 / icon / name / duration / status | |
| F5.4 | 错误 Span 红色高亮 | |

#### 步骤 F6：实现 PerformanceStats

**文件：** `sibylla-desktop/src/renderer/components/inspector/PerformanceStats.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F6.1 | Props: `{ traceId }` | |
| F6.2 | 按 span name 聚合统计 | 调用次数 / 平均耗时 / P95 / 最大 / 错误次数 |
| F6.3 | 可排序列表格 | |
| F6.4 | 颜色编码 | 高耗时红 / 正常绿 |

#### 步骤 F7：实现 SpanDetailPane

**文件：** `sibylla-desktop/src/renderer/components/inspector/SpanDetailPane.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F7.1 | Props: `{ spanId }` | |
| F7.2 | 从 traceStore.currentSpans 查找 | |
| F7.3 | 概览区：name / kind / status / duration / 时间 | |
| F7.4 | 父子链：parentSpanId → 子 Span 列表（可点击跳转） | |
| F7.5 | Attributes 键值表格 | 脱敏值标红 |
| F7.6 | Events 时间线列表 | |
| F7.7 | Context：conversationId / taskId / workspaceId | |

#### 步骤 F8：实现 SearchBar

**文件：** `sibylla-desktop/src/renderer/components/inspector/SearchBar.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F8.1 | Props: `{ traceId }` | |
| F8.2 | 遍历 currentSpans 的 attributes + events.attributes | |
| F8.3 | 匹配项高亮 + 显示匹配数量 | |
| F8.4 | 点击结果跳转到对应 Span | |

#### 步骤 F9：实现 ExportDialog

**文件：** `sibylla-desktop/src/renderer/components/inspector/ExportDialog.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F9.1 | 模态对话框三步流程 | |
| F9.2 | 步骤 1：预检—previewExport 显示脱敏报告 | |
| F9.3 | 步骤 2：用户添加自定义规则（动态表单） | |
| F9.4 | 步骤 3：确认导出—选择路径，调用 exportTrace | |
| F9.5 | 进度指示和成功/失败反馈 | |

---

### 阶段 G：ProgressPanel 套件（预计 0.5 工作日）

> 产出任务面板。

#### 步骤 G1：实现 ProgressPanel

**文件：** `sibylla-desktop/src/renderer/components/progress/ProgressPanel.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| G1.1 | 使用 useProgressStore | |
| G1.2 | 挂载时 fetchSnapshot() | |
| G1.3 | 三区域渲染：🔄进行中 / ✅已完成 / 📋排队中 | |
| G1.4 | 监听 IPC 事件实时更新 | onProgressEvent |
| G1.5 | 进行中任务每秒刷新耗时显示 | setInterval |

#### 步骤 G2：实现 TaskCard

**文件：** `sibylla-desktop/src/renderer/components/progress/TaskCard.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| G2.1 | Props: `{ task: TaskRecord }` | |
| G2.2 | 显示：ID / 标题 / 状态 / 模式 / 耗时 | |
| G2.3 | Trace 链接 → window.sibylla.inspector.open(task.traceId) | |
| G2.4 | 进行中：TaskChecklist 子组件 | |
| G2.5 | 已完成：结果摘要或失败原因 | |

#### 步骤 G3：实现 TaskChecklist

**文件：** `sibylla-desktop/src/renderer/components/progress/TaskChecklist.tsx`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| G3.1 | Props: `{ items: ChecklistItem[] }` | |
| G3.2 | 渲染各条：⏸/🔄/✅/⏭ 图标 + description | |

---

### 阶段 H：StudioAIPanel 集成 + 快捷键（预计 0.5 工作日）

> 产出完整的端到端集成。

#### 步骤 H1：StudioAIPanel 改造

**文件：** `sibylla-desktop/src/renderer/components/studio/StudioAIPanel.tsx`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| H1.1 | AI 消息气泡新增 `traceId` prop | 从 AIStreamEnd 事件提取 |
| H1.2 | AI 消息气泡下方挂载 `<ExecutionTrace>` | messageId + traceId |
| H1.3 | 处理 traceId 不存在时的条件渲染 | 无 traceId 时不显示按钮 |

#### 步骤 H2：键盘快捷键注册

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| H2.1 | 注册 Ctrl+Shift+T (macOS Cmd+Shift+T) | 打开 Trace Inspector |
| H2.2 | 快捷键触发 traceStore 打开 Inspector 面板 | |
| H2.3 | 若有 initialTraceId 则预选 | |

---

### 阶段 I：单元测试（预计 1 工作日）

> 覆盖主进程服务核心逻辑和渲染进程关键组件。

#### 步骤 I1：performance-monitor.test.ts

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| I1.1 | computeMetrics — 正确计算 LLM 调用统计 | avg/p95/errorRate |
| I1.2 | slow call detection — 慢调用 > 阈值标记 | consecutiveCount++ |
| I1.3 | error rate detection — 错误率 > 5% 标记 | |
| I1.4 | token spike detection — Token > 30K 标记 | |
| I1.5 | consecutive alert — 连续 3 窗口触发告警 | emitPerformanceAlert 被调用 |
| I1.6 | suppress alert — 屏蔽后不触发告警 | isSuppressed 返回 true |
| I1.7 | auto-clear alert — 连续 5 窗口恢复后清除 | emitPerformanceAlertCleared |
| I1.8 | estimated cost — 告警含预估美元成本 | |

#### 步骤 I2：replay-engine.test.ts

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| I2.1 | rebuild snapshot — 正确提取 prompt/context/memory/config | |
| I2.2 | approximate memory — 无精确快照时标记 isApproximate | |
| I2.3 | deleted file — 文件不存在时替换为 placeholder | |
| I2.4 | rerun — 创建新 Trace，含 replay.of 属性 | |
| I2.5 | related reruns — 查询原 Trace 的所有回放 | |

#### 步骤 I3：trace-exporter.test.ts

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| I3.1 | preview redaction — 预检列出所有将脱敏的字段 | |
| I3.2 | default rules — 默认规则覆盖 api_key/token/email/user_path | |
| I3.3 | custom rules — 自定义规则生效 | |
| I3.4 | export JSON — 导出文件不含原始敏感值 | |
| I3.5 | import — 导入后 traceId/spanId 带 imported- 前缀 | |
| I3.6 | no file contents — 默认不嵌入文件内容 | |

#### 步骤 I4：renderer 组件测试

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| I4.1 | ExecutionTrace — 展开按钮渲染 | |
| I4.2 | ExecutionTrace — 展开后加载 spans | |
| I4.3 | ExecutionTrace — 白名单过滤生效 | |
| I4.4 | traceStore — fetchRecentTraces 正确更新状态 | |
| I4.5 | traceStore — selectTrace 触发 fetchTraceTree | |
| I4.6 | progressStore — fetchSnapshot 正确更新状态 | |

---

## 五、关键设计决策

### 5.1 渲染进程严格隔离

所有数据查询通过 IPC，渲染进程不得直接访问 TraceStore 或文件系统。Zustand store 的每个 action 内部调用 `window.sibylla.trace.*` / `window.sibylla.progress.*` / `window.sibylla.performance.*`，由 Preload API 封装 `ipcRenderer.invoke`。

### 5.2 Shared 类型转换边界

主进程内部使用完整类型（含 RegExp、Date 等），IPC 传输前转为 `*Shared` 类型（仅含可序列化字段）。TraceHandler 的 `toShared()` 方法承担此转换。`RedactionRule` 的 `keyPattern: RegExp` 序列化为 `source + flags` string，反序列化时重建 RegExp。

### 5.3 PerformanceMonitor 零阻塞

`aggregateAndAlert()` 在 `setInterval` 回调中执行，查询 TraceStore 为同步（better-sqlite3），但查询范围限制在 15 分钟窗口，索引已覆盖。告警通知通过 eventBus 异步推送，不阻塞主流程。

### 5.4 FlameGraph Canvas 渲染

选择 Canvas 而非 DOM 渲染火焰图，原因：
- < 500 spans 下 DOM 方案可行但 >500 时卡顿
- Canvas hitTest 通过像素坐标计算，复杂度 O(spans)
- 文字裁剪用 `ctx.measureText()` + 截断

### 5.5 ExecutionTrace 懒加载

对话气泡默认不加载 Trace 数据，用户点击"展开执行轨迹"时才通过 IPC 查询。避免每条消息都发起 IPC 请求。

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| FlameGraph 大 Trace 卡顿 | 中 | Canvas + 虚拟化；>500 spans 降级为树形视图提示 |
| PerformanceMonitor 查询开销 | 低 | 15min 窗口 + 索引覆盖；60s 间隔足够 |
| ReplayEngine 缺少 AIGateway 接口 | 高 | 需确认 ai-gateway.ts 是否存在；若不存在需新建或使用现有 AIHandler 路径 |
| Preload API ALLOWED_CHANNELS 遗漏 | 中 | 逐一核对 IPC_CHANNELS 常量，确保全部添加 |
| Event push 在多窗口时重复 | 低 | 仅推送到当前聚焦窗口或使用 webContents ID 过滤 |
| shared/types.ts 膨胀 | 低 | Performance 类型独立区块，有序追加 |
| StudioAIPanel 改造破坏现有功能 | 中 | traceId 为可选 prop，无 traceId 时 ExecutionTrace 不渲染 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | shared/types.ts Performance/Trace 共享类型 |
| Day 1 下午 | A2 | PerformanceMonitor 完整实现 |
| Day 2 上午 | A3 | ReplayEngine 完整实现 |
| Day 2 下午 | A4 | TraceExporter 完整实现 |
| Day 3 上午 | B1-B3 | TraceHandler + Preload API + AppEventBus 类型 |
| Day 3 下午 | C1-C2 | 主进程初始化 + 事件推送注册 |
| Day 4 上午 | D1-D2 | traceStore + progressStore |
| Day 4 下午 | E1 + H1 | ExecutionTrace + StudioAIPanel 集成 |
| Day 5 | F1-F9 | TraceInspector 全套组件 |
| Day 6 上午 | G1-G3 + H2 | ProgressPanel + 快捷键 |
| Day 6 下午 | I1-I4 | 单元测试全部通过 |

---

## 八、验收标准追踪

### 对话气泡执行轨迹

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | AI 消息完成后显示"🔍 展开执行轨迹"按钮 | E1.4 + H1.2 | I4.1 |
| 2 | 点击按钮在气泡内展开简化时间线，渲染 < 100ms | E1.5-E1.8 | I4.2 |
| 3 | 只展示用户可见 Span（白名单过滤） | E1.6 | I4.3 |
| 4 | 耗时异常 Span 橙色高亮 | E1.9 | — |
| 5 | 失败或降级 Span 红色标记 | E1.10 | — |
| 6 | 点击 Span 行显示属性详情 popover | E1.11 | — |
| 7 | "查看完整 Trace"链接打开 Trace Inspector | E1.12 | — |
| 8 | Trace 数据仍在写入时自动刷新一次 | E1.13 | — |

### Trace Inspector

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | Ctrl+Shift+T 打开面板 | H2.1 |
| 2 | 左侧列表显示最近 100 条 Trace | F2.2-F2.3 |
| 3 | 选中 Trace 后火焰图渲染 < 300ms | F3.2-F3.9 |
| 4 | 点击 Span 显示右侧详情 | F7.1-F7.7 |
| 5 | 四种视图切换 | F1.4 + F3-F6 |
| 6 | 底部搜索栏全文搜索 | F8.1-F8.4 |
| 7 | 错误 Span 红色边框 + 自动展开 | F3.6 + F4.5 |
| 8 | 对比模式 | F1.4 |
| 9 | 导出生成 JSON bundle | F9.1-F9.5 |

### Progress 任务面板

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | 面板展示 active/completedRecent/queued 任务 | G1.3 |
| 2 | 每条任务显示 ID/标题/状态/耗时/Trace 链接 | G2.2-G2.3 |
| 3 | 进行中任务实时更新耗时 | G1.5 |
| 4 | Trace 链接跳转 Trace Inspector | G2.3 |
| 5 | 任务事件实时推送 | G1.4 |

### PerformanceMonitor

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 每 60s 聚合滚动 15min 窗口指标 | A2.7 + A2.10 | I1.1 |
| 2 | 慢调用 > 10s 标记 | A2.11 | I1.2 |
| 3 | Token 异常 > 30K 标记 | A2.11 | I1.4 |
| 4 | 错误率 > 5% 标记 | A2.11 | I1.3 |
| 5 | 连续 3 窗口触发告警通知 | A2.9 | I1.5 |
| 6 | 告警含预估美元成本 | A2.10-A2.11 | I1.8 |
| 7 | 用户可屏蔽特定告警类型 24 小时 | A2.12 | I1.6 |
| 8 | 连续 5 窗口恢复后自动清除 | A2.9 | I1.7 |

### ReplayEngine

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 重建快照提取 prompt/context/memory/params | A3.3 | I2.1 |
| 2 | 记忆快照近似时标记 isApproximate | A3.3 | I2.2 |
| 3 | 文件已删除时替换为 placeholder | A3.4 | I2.3 |
| 4 | Rerun 创建新 Trace 含 replay.of | A3.5 | I2.4 |
| 5 | 原 Trace 显示相关回放列表 | A3.6 | I2.5 |

### TraceExporter

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 导出预检脱敏预览 < 1 秒 | A4.5 | I3.1 |
| 2 | 预览列出将被替换的字段及匹配原因 | A4.5-A4.6 | I3.1 |
| 3 | 用户可添加自定义脱敏规则 | A4.5 | I3.3 |
| 4 | 确认导出生成 JSON，不含原始敏感信息 | A4.7 | I3.4 |
| 5 | 导入标记 imported 前缀 | A4.8 | I3.5 |
| 6 | 文件内容默认不嵌入 | A4.7 options | I3.6 |

### IPC 集成

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | Trace IPC handler 注册 | B1 |
| 2 | Performance IPC handler 注册 | B1 |
| 3 | 所有新 IPC 通道类型安全 | B1 + A1 |
| 4 | Preload API 扩展 | B2 |
| 5 | 主进程→渲染进程事件正确推送 | C2 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-21
**维护者**: Sibylla 架构团队
