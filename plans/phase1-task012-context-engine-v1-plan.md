# PHASE1-TASK012: 上下文引擎 v1 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task012_context-engine-v1.md](../specs/tasks/phase1/phase1-task012_context-engine-v1.md)
> 创建日期：2026-04-18
> 最后更新：2026-04-18

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK012 |
| **任务标题** | 上下文引擎 v1 |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | ✅ FileManager（文件读取）、✅ AIHandler（集成点）、⚠️ TASK011（流式响应基础，需联调） |

### 目标

将当前 `ai.handler.ts` 中硬编码的上下文组装逻辑（systemSegments = 硬编码 prompt + MEMORY 截断 + RAG 命中）抽象为独立的 `ContextEngine` 模块，实现三层上下文模型的第一层（始终加载）和第三层（手动引用），让 AI 能够理解项目背景而不需要用户重复解释。

### 核心命题

当前 `ai.handler.ts` 的上下文组装存在以下问题：
1. **无分层概念**：CLAUDE.md / MEMORY / 当前文件 / RAG 结果混在一起，没有优先级管理
2. **无 Token 预算**：仅对 MEMORY 做了 5000 字符硬截断，无全局 token 预算分配
3. **无手动引用**：用户无法通过 `@文件名` 主动指定上下文来源
4. **无来源追踪**：`contextSources` 仅记录 RAG 命中，不包含始终加载层和手动引用层
5. **无 Spec 文件识别**：不会根据场景自动加载 requirements / design / tasks 等 Spec 文件

### 范围边界

**包含：**
- `ContextEngine` 独立模块（`src/main/services/context-engine.ts`）
- 始终加载层：CLAUDE.md + 当前编辑文件 + Spec 文件自动识别
- 手动引用层：`@[[文件路径]]` 解析 + 文件内容加载
- Token 预算管理（`estimateTokens` + `allocateBudget` + `truncateToBudget`）
- 来源追踪（`ContextSourceTracker`：记录并返回所有引用文件列表）
- 前端 `@` 自动补全 UI（`StudioAIPanel.tsx` 中的文件搜索下拉菜单）
- IPC 通道扩展：`AI_CONTEXT_FILES: 'ai:context:files'`
- 与现有 `MemoryManager` / `LocalRagEngine` 集成

**不包含：**
- 语义搜索自动召回（第二层，Phase 2 Sprint 4 上下文引擎 v2）
- 向量检索上下文注入
- `@成员名` 工作内容引用
- MCP 集成

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；所有异步操作必须有错误处理；关键操作结构化日志；代码注释英文，文档中文 |
| 系统架构 | `specs/design/architecture.md` §4 | 三层上下文模型定义；Token 预算策略（优先 L1+L3，弹性 L2，预留 30%）；上下文引擎作为核心模块独立于 AIHandler |
| 数据模型与 API | `specs/design/data-and-api.md` §5.3 | AI IPC 操作接口规范；ChatRequest 应包含 context 字段 |
| 需求规格 | `specs/requirements/phase1/sprint3-ai-mvp.md` §2.1/§2.6 | 需求 2.1（上下文引擎 v1 完整验收标准）；需求 2.6（Spec 工作流自动加载） |
| 任务规格 | `specs/tasks/phase1/phase1-task012_context-engine-v1.md` | 架构图、核心类型、IPC 通道扩展、前端 @ 自动补全规范 |
| 记忆系统设计 | `specs/design/memory-system-design.md` | MEMORY.md 精选记忆层（8-12K tokens）与上下文引擎的集成点；日志 append-only 格式 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | AI 对话窗口交互规范；@ 自动补全下拉菜单交互标准 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `ai-context-engine` | `.kilocode/skills/phase1/ai-context-engine/SKILL.md` | 三层上下文模型架构参考、Token 预算分配策略、上下文组装算法、`ContextAssembler` 接口设计模式、`TokenBudgetManager` 实现参考 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | 新增 IPC 通道规范、Preload bridge 设计、invoke/handle 模式用于 @ 自动补全查询 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 严格类型约束；泛型与高级类型设计（`AssembledContext` 类型族）；类型守卫 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | `aiChatStore` 扩展（新增 `contextSources` 状态）；selector 精确订阅 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | `@` 自动补全组件性能优化（debounce 搜索、虚拟列表）；`useCallback` / `useMemo` 稳定引用 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` | 436 | ⚠️ 需重构 | `handleChatLikeRequest()` 和 `handleStream()` 中硬编码的 `systemSegments` 组装逻辑需替换为 `ContextEngine.assembleContext()` |
| FileManager | `src/main/services/file-manager.ts` | 1542 | ✅ 已完成 | `readFile()` / `exists()` / `listFiles()` 直接复用；上下文引擎通过此模块读取所有文件内容 |
| MemoryManager | `src/main/services/memory-manager.ts` | 415 | ✅ 已完成 | `getMemorySnapshot()` 提供精选记忆内容；`appendLog()` 记录上下文使用日志 |
| LocalRagEngine | `src/main/services/local-rag-engine.ts` | 293 | ✅ 已完成 | `search()` 方法保留用于 RAG 命中（当前保留原有逻辑，v2 迁移到第二层） |
| IPC_CHANNELS | `src/shared/types.ts:72-190` | 1012 | ⚠️ 需扩展 | 缺少 `AI_CONTEXT_FILES: 'ai:context:files'` 通道 |
| AIChatRequest | `src/shared/types.ts:570-616` | — | ⚠️ 需扩展 | 需新增 `manualRefs?: string[]` 字段（`@[[文件路径]]` 解析结果） |
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | 245 | ⚠️ 需扩展 | 需新增 `@` 自动补全下拉菜单；`contextSources` 渲染已存在 |
| aiChatStore | `src/renderer/store/aiChatStore.ts` | 210 | ✅ 已完成 | `contextSources` 字段已存在，从 `ragHits` 填充，需扩展为包含所有上下文来源 |
| ChatMessage 类型 | `src/renderer/components/studio/types.ts` | 51 | ✅ 已完成 | `contextSources?: string[]` 字段已满足需求 |
| Preload ai API | `src/preload/index.ts` | 705 | ⚠️ 需扩展 | 需新增 `ai.contextFiles(query)` 方法用于 @ 自动补全 IPC 调用 |
| IpcHandler 基类 | `src/main/ipc/handler.ts` | 221 | ✅ 已完成 | `safeHandle()` 包装用于新增的 `AI_CONTEXT_FILES` 通道 |
| WorkspaceManager | `src/main/services/workspace-manager.ts` | — | ✅ 已完成 | 提供 `getWorkspaceRoot()` 确定文件搜索范围 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK014（Skill 系统） | Skill 内容通过上下文引擎注入到 AI 上下文 |
| PHASE1-TASK016（记忆联调） | 上下文引擎需与记忆系统协同 flush |
| Phase 2 上下文引擎 v2 | 第二层语义搜索自动召回基于本任务搭建的基础架构 |

### 2.5 npm 依赖

无需新增 npm 包。核心依赖已安装：
- `zustand` ^5.0.11 — aiChatStore 扩展
- `lucide-react` ^0.577.0 — 图标（Search, FileText, X）
- `clsx` + `tailwind-merge` — 样式工具
- `@testing-library/react` + `vitest` — 测试框架

**Token 计算方案：** 继续使用现有 `estimateTokens()` CJK 感知字符计数法（`chars/4 + CJK/2`），不引入 `tiktoken`。理由：MVP 阶段精度够用，避免引入 native 依赖增加构建复杂度。

---

## 三、现有代码盘点与差距分析

### 3.1 当前上下文组装数据流

```
AIHandler.handleChatLikeRequest()
  │
  ├── systemSegments = []
  │   ├── push('你是 Sibylla AI 助手...')     // 硬编码 system prompt
  │   ├── push(memorySnapshot?.slice(0, 5000)) // MEMORY 硬截断
  │   └── push(...ragHits.map(h => h.content)) // RAG 命中直接拼接
  │
  ├── messages = [system, ...history, user]
  │
  └── gatewayClient.chat({ messages })
```

**问题清单：**
1. CLAUDE.md 未加载 → AI 不知道项目规范
2. 当前编辑文件未加载 → AI 不知道用户在编辑什么
3. 无 `@文件名` 手动引用机制
4. 无 Token 预算全局管理
5. `contextSources` 仅包含 RAG 命中，缺少始终加载层和手动引用层
6. Spec 文件（requirements/design/tasks）不会根据场景自动加载

### 3.2 目标上下文组装数据流

```
渲染进程                          主进程
  │                                │
  │ ipcRenderer.send('ai:stream',  │
  │   { message, currentFile,      │
  │     manualRefs: ['docs/...']})  │
  │───────────────────────────────▶│
  │                                │ ContextEngine.assembleContext(request)
  │                                │   ├── Layer 1: Always-Load
  │                                │   │   ├── CLAUDE.md
  │                                │   │   ├── currentFile
  │                                │   │   └── specFiles (按场景)
  │                                │   ├── Layer 3: Manual-Reference
  │                                │   │   └── @引用的文件
  │                                │   └── Token Budget Manager
  │                                │       ├── estimateTokens()
  │                                │       ├── allocateBudget()
  │                                │       └── truncateToBudget()
  │                                │
  │                                │ → AssembledContext
  │                                │ → systemPrompt + contextSegments
  │                                │ → sourceTracker.getSourceList()
  │                                │
  │                                │ gatewayClient.chatStream(...)
  │◀── ai:stream:chunk ───────────│
  │◀── ai:stream:end ─────────────│ (包含 contextSources)
```

### 3.3 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| CLAUDE.md 自动加载 | ❌ 未加载 | 无始终加载机制 | `ContextEngine.collectAlwaysLoad()` |
| 当前文件自动加载 | ❌ 未加载 | `AIChatRequest` 有 `currentFile` 但未用于上下文 | 在 `collectAlwaysLoad()` 中读取 |
| @文件名手动引用 | ❌ 无解析 | 无正则解析、无文件搜索、无 UI | `extractFileReferences()` + 自动补全 UI |
| Token 预算管理 | ⚠️ 仅 MEMORY 硬截断 5000 字符 | 无全局预算、无分层分配 | `TokenBudgetManager` |
| 来源追踪 | ⚠️ 仅 RAG hits | 缺少始终加载层和手动引用层 | `ContextSourceTracker` |
| Spec 文件识别 | ❌ 无 | 不识别 requirements/design/tasks | `loadSpecFiles()` |
| @ 自动补全 UI | ❌ 无 | 输入框无 `@` 触发下拉 | `FileAutocomplete` 组件 |
| 文件搜索 IPC | ❌ 无 | 无通道支持前端查询文件列表 | `AI_CONTEXT_FILES` IPC 通道 |

### 3.4 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/main/services/context-engine.ts` | 新增 | ContextEngine 核心模块（上下文组装 + Token 预算 + 来源追踪） |
| 2 | `src/renderer/components/studio/FileAutocomplete.tsx` | 新增 | @ 自动补全下拉菜单组件 |
| 3 | `tests/main/ContextEngine.test.ts` | 新增 | ContextEngine 单元测试 |
| 4 | `tests/main/TokenBudgetManager.test.ts` | 新增 | Token 预算管理测试 |
| 5 | `tests/renderer/FileAutocomplete.test.tsx` | 新增 | @ 自动补全组件测试 |

### 3.5 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/shared/types.ts` | 新增 `AI_CONTEXT_FILES` IPC 通道 + 上下文引擎类型定义 + `AIChatRequest` 扩展 `manualRefs` | 低 — 纯扩展 |
| 2 | `src/main/ipc/handlers/ai.handler.ts` | `systemSegments` 组装逻辑替换为 `ContextEngine.assembleContext()` | 高 — 核心变更 |
| 3 | `src/preload/index.ts` | 新增 `ai.contextFiles(query)` 方法 | 低 — 纯新增 |
| 4 | `src/renderer/components/studio/StudioAIPanel.tsx` | 集成 `FileAutocomplete` 组件；传递 `manualRefs` 到发送请求 | 中 — UI 变更 |
| 5 | `src/renderer/store/aiChatStore.ts` | `contextSources` 来源扩展（从仅 RAG → 全部来源） | 低 — 字段扩展 |
| 6 | `src/renderer/dev/mockElectronAPI.ts` | 新增 `contextFiles` mock | 低 — 开发辅助 |
| 7 | `tests/renderer/setup.ts` | 新增 `contextFiles` mock | 低 — 测试辅助 |

### 3.6 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/main/services/file-manager.ts` | 仅通过已有 `readFile()` / `listFiles()` / `exists()` 接口调用 |
| `src/main/services/memory-manager.ts` | `getMemorySnapshot()` / `appendLog()` 接口不变 |
| `src/main/services/local-rag-engine.ts` | `search()` 保留原有调用方式，v2 再迁移到第二层 |
| `src/main/services/ai-gateway-client.ts` | 不改动，`chatStream()` 接收组装后的 messages |
| `src/renderer/components/studio/types.ts` | `ChatMessage.contextSources` 类型已满足 |
| `src/renderer/hooks/useAIStream.ts` | 不改动，流式消费逻辑不变 |

---

## 四、类型系统设计

### 4.1 新增 IPC 通道（`src/shared/types.ts`）

```typescript
// 在 IPC_CHANNELS 对象中新增（AI 操作区块内）
AI_CONTEXT_FILES: 'ai:context:files',   // @ 文件自动补全查询
```

### 4.2 新增上下文引擎类型（`src/shared/types.ts`）

```typescript
/** Context layer type */
export type ContextLayerType = 'always' | 'manual'

/** Individual context source */
export interface ContextSource {
  filePath: string
  content: string
  tokenCount: number
  layer: ContextLayerType
}

/** A context layer containing multiple sources */
export interface ContextLayer {
  type: ContextLayerType
  sources: ContextSource[]
  totalTokens: number
}

/** Fully assembled context ready for AI consumption */
export interface AssembledContext {
  layers: ContextLayer[]
  systemPrompt: string
  totalTokens: number
  budgetUsed: number
  budgetTotal: number
  sources: ContextSource[]
  warnings: string[]
}

/** Context engine configuration */
export interface ContextEngineConfig {
  maxContextTokens: number        // default: 16000
  systemPromptReserve: number     // default: 2000
  alwaysLoadFiles: string[]       // default: ['CLAUDE.md']
}

/** File info for @ autocomplete results */
export interface ContextFileInfo {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
}
```

### 4.3 扩展 AIChatRequest（`src/shared/types.ts`）

```typescript
// 在现有 AIChatRequest 中新增字段
export interface AIChatRequest {
  // ... existing fields ...
  /** Manually referenced file paths via @[[path]] syntax */
  manualRefs?: string[]
}
```

### 4.4 IPCChannelMap 扩展

```typescript
// 在 IPCChannelMap 中新增映射
[IPC_CHANNELS.AI_CONTEXT_FILES]: {
  params: { query: string; limit?: number }
  result: IPCResponse<ContextFileInfo[]>
}
```

### 4.5 设计决策说明

**`manualRefs` 放在 `AIChatRequest` 而非独立参数：**
- 与现有 `AIChatRequest` 携带的 `currentFile` / `message` / `model` 保持一致
- 前端发送时统一打包，主进程侧无需额外解析 IPC 参数
- 后续 v2 扩展 `memberRefs` 时直接同层新增字段

**`AssembledContext` 包含 `warnings` 数组：**
- 超预算时记录警告信息（如 "CLAUDE.md truncated from 8000 to 3000 tokens"）
- 警告可通过 `AIStreamEnd` 传递到前端，在 UI 上展示上下文裁剪提示
- 避免静默截断导致用户困惑

**`ContextSource.layer` 使用 `'always' | 'manual'` 而非 `'always_load' | 'manual_ref'`：**
- 与任务 spec 定义保持一致
- v2 新增 `'semantic'` 层时直接扩展联合类型

---

## 五、ContextEngine 核心模块设计

### 5.1 模块架构

```
ContextEngine
├── assembleContext(request)          // 主入口：组装完整上下文
│   ├── collectAlwaysLoad(request)    // Layer 1: 始终加载
│   │   ├── loadFile('CLAUDE.md')
│   │   ├── loadFile(request.currentFile)
│   │   └── loadSpecFiles(request)    // Spec 文件自动识别
│   ├── collectManualRefs(request)    // Layer 3: 手动引用
│   │   └── loadFile(path) for each manualRef
│   ├── allocateBudget(layers)        // Token 预算分配
│   └── truncateToBudget(layers)      // 超预算裁剪
├── extractFileReferences(message)    // 解析 @[[文件路径]]
├── findMatchingFiles(query, limit)   // 文件模糊搜索（@ 自动补全）
└── SourceTracker                     // 来源追踪
    ├── track(source)
    └── getSourceList() → string[]
```

### 5.2 ContextEngine 类设计

```typescript
// src/main/services/context-engine.ts

export class ContextEngine {
  private readonly config: Required<ContextEngineConfig>
  private readonly fileManager: FileManager
  private readonly memoryManager: MemoryManager

  constructor(
    fileManager: FileManager,
    memoryManager: MemoryManager,
    config?: Partial<ContextEngineConfig>
  )

  async assembleContext(request: ContextAssemblyRequest): Promise<AssembledContext>

  extractFileReferences(message: string): string[]

  async findMatchingFiles(query: string, limit?: number): Promise<ContextFileInfo[]>

  private async collectAlwaysLoad(request: ContextAssemblyRequest): Promise<ContextSource[]>
  private async collectManualRefs(manualRefs: string[]): Promise<ContextSource[]>
  private async loadSpecFiles(currentFile?: string): Promise<ContextSource[]>
  private allocateBudget(alwaysSources: ContextSource[], manualSources: ContextSource[]): BudgetAllocation
  private truncateToBudget(sources: ContextSource[], maxTokens: number): ContextSource[]
  private estimateTokens(text: string): number
  private async safeLoadFile(relativePath: string): Promise<ContextSource | null>
}
```

### 5.3 ContextAssemblyRequest 接口

```typescript
/** Internal request for context assembly */
export interface ContextAssemblyRequest {
  userMessage: string
  currentFile?: string
  manualRefs: string[]
}
```

### 5.4 assembleContext() 核心流程

```
1. collectAlwaysLoad(request)
   ├── safeLoadFile('CLAUDE.md')
   ├── safeLoadFile(request.currentFile)
   └── loadSpecFiles(request.currentFile)
       ├── 'requirements.md' — 规划/分析任务场景
       ├── 'design.md' — 技术讨论场景
       └── 'tasks.md' — 任务管理场景

2. collectManualRefs(request.manualRefs)
   └── for each ref: safeLoadFile(ref)

3. allocateBudget(alwaysSources, manualSources)
   ├── totalBudget = maxContextTokens - systemPromptReserve
   ├── fixedTokens = alwaysTokens + manualTokens
   ├── if fixedTokens > totalBudget → 按比例裁剪
   └── warnings.push(...) if truncated

4. buildSystemPrompt(alwaysSources)
   └── Join all always-load sources with separators

5. Return AssembledContext { layers, systemPrompt, totalTokens, sources, warnings }
```

### 5.5 Token 预算管理策略

```typescript
interface BudgetAllocation {
  alwaysTokens: number
  manualTokens: number
  overBudget: boolean
}

// 分配逻辑：
// totalBudget = config.maxContextTokens - config.systemPromptReserve
// 例：16000 - 2000 = 14000 tokens 可用于上下文
//
// 优先级：
// 1. Layer 1（始终加载）— 不可裁剪（除非总额超限）
// 2. Layer 3（手动引用）— 用户意图，优先保留
// 3. 超限处理：始终加载层按 70% 裁剪，手动引用层按 30% 裁剪
//
// 裁剪策略（truncateToBudget）：
// - 按句子边界截断（正则：/(?<=[.!?。\n])\s*/）
// - 保留文件开头（前 N 句），通常最重要的上下文在前部
// - 追加 "[... truncated due to token budget]" 标记
```

### 5.6 extractFileReferences() 解析规则

```typescript
extractFileReferences(message: string): string[] {
  const regex = /@\[\[([^\]]+)\]\]/g
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(message)) !== null) {
    matches.push(match[1].trim())
  }
  return [...new Set(matches)]  // 去重
}
```

**解析格式：** `@[[文件路径]]` — 双方括号避免与普通 `@mention` 冲突。

### 5.7 findMatchingFiles() 文件搜索

```typescript
async findMatchingFiles(query: string, limit: number = 20): Promise<ContextFileInfo[]> {
  // 1. FileManager.listFiles() 递归获取文件列表
  // 2. 按 query 模糊匹配 path.name 和 path
  // 3. 排除系统目录（.git/, .sibylla/, node_modules/）
  // 4. 排除非文本文件（.png, .jpg, .zip, etc.）
  // 5. 按匹配度排序（完整包含 > 开头匹配 > 包含匹配）
  // 6. 限制 limit 条
}
```

### 5.8 Spec 文件自动识别策略

```typescript
private async loadSpecFiles(currentFile?: string): Promise<ContextSource[]> {
  const sources: ContextSource[] = []

  // 优先级从高到低：
  // 1. CLAUDE.md — 始终加载（在 collectAlwaysLoad 中已处理）
  // 2. requirements.md — 当场景涉及规划/分析时加载
  // 3. design.md — 当场景涉及技术讨论时加载
  // 4. tasks.md — 当场景涉及任务管理时加载
  // 5. 当前文件夹 _spec.md — 当编辑文件所在目录存在时加载

  const specCandidates = ['requirements.md', 'design.md', 'tasks.md']
  for (const specFile of specCandidates) {
    const source = await this.safeLoadFile(specFile)
    if (source) sources.push(source)
  }

  // 当前文件夹 _spec.md
  if (currentFile) {
    const dir = currentFile.substring(0, currentFile.lastIndexOf('/'))
    if (dir) {
      const folderSpec = await this.safeLoadFile(`${dir}/_spec.md`)
      if (folderSpec) sources.push(folderSpec)
    }
  }

  return sources
}
```

**v1 策略：** 所有存在的 Spec 文件都加载（简单策略）。v2 可根据用户消息内容智能判断加载哪些 Spec 文件。

### 5.9 与现有 RAG 的集成策略

**v1 方案：** 保留现有 `queryRagSafely()` 逻辑，不改动。上下文引擎组装的是 "始终加载层 + 手动引用层"，RAG 结果继续由 `ai.handler.ts` 追加到 `systemSegments`。

**组装顺序：**
```
systemSegments = [
  ...contextEngine.alwaysLoadSources,   // Layer 1: CLAUDE.md + currentFile + specs
  ...contextEngine.manualRefSources,     // Layer 3: @引用文件
  ...ragHits,                            // 现有 RAG（保持不变）
  memorySnapshot,                        // MEMORY（保持不变）
]
```

这样做的理由：
- 不破坏现有 RAG 逻辑，降低风险
- v2 将 RAG 迁移到第二层时，直接在 `ContextEngine.assembleContext()` 中集成
- 渐进式重构，每步可独立验证

---

## 六、IPC 接口扩展

### 6.1 新增通道注册

```typescript
// src/main/ipc/handlers/ai.handler.ts — register() 中新增
ipcMain.handle(
  IPC_CHANNELS.AI_CONTEXT_FILES,
  this.safeHandle(this.handleContextFiles.bind(this))
)
```

### 6.2 handleContextFiles 实现

```typescript
private async handleContextFiles(
  _event: IpcMainInvokeEvent,
  input: unknown
): Promise<ContextFileInfo[]> {
  const { query, limit } = validateContextFilesInput(input)
  return this.contextEngine.findMatchingFiles(query, limit)
}
```

### 6.3 Preload Bridge 扩展

```typescript
// src/preload/index.ts ai 命名空间新增
contextFiles: async (query: string, limit?: number): Promise<IPCResponse<ContextFileInfo[]>> => {
  return api.invoke(IPC_CHANNELS.AI_CONTEXT_FILES, { query, limit })
}
```

### 6.4 ElectronAPI 类型更新

```typescript
// preload/index.ts ElectronAPI interface 扩展
ai: {
  // ... existing methods ...
  contextFiles: (query: string, limit?: number) => Promise<IPCResponse<ContextFileInfo[]>>
}
```

---

## 七、前端 @ 自动补全设计

### 7.1 FileAutocomplete 组件

```typescript
// src/renderer/components/studio/FileAutocomplete.tsx

interface FileAutocompleteProps {
  query: string                // @ 后面的搜索文本
  onSelect: (filePath: string) => void
  onClose: () => void
  position: { top: number; left: number }  // 相对输入框的位置
}
```

**组件行为：**
1. 接收 `query` 参数（`@` 后面的文本）
2. debounce 200ms 后调用 `window.electronAPI.ai.contextFiles(query)`
3. 展示文件列表下拉菜单（带文件图标 + 路径）
4. 键盘上下键导航，Enter 选择，Esc 关闭
5. 选择后回调 `onSelect(filePath)`
6. 点击外部区域关闭

### 7.2 StudioAIPanel 集成

**改造要点：**

1. **状态新增：**
   - `autocompleteVisible: boolean` — 控制下拉菜单显示
   - `autocompleteQuery: string` — 当前搜索文本
   - `autocompletePosition: { top, left }` — 下拉菜单位置

2. **输入监听：**
   - `onKeyDown` / `onInput` 检测 `@` 字符输入
   - 提取 `@` 后到光标位置的文本作为 `query`
   - 计算下拉菜单定位（相对于 textarea）

3. **选择处理：**
   - `onSelect(filePath)` → 将 `@query` 替换为 `@[[filePath]] `
   - 光标移动到插入内容之后

4. **manualRefs 收集：**
   - 发送消息时调用 `extractFileReferences(input)` 提取所有 `@[[...]]` 引用
   - 将 `manualRefs` 传入 `onSendMessage` 回调

### 7.3 渲染进程 extractFileReferences

```typescript
// 复用与主进程相同的正则
function extractFileReferences(text: string): string[] {
  const regex = /@\[\[([^\]]+)\]\]/g
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim())
  }
  return [...new Set(matches)]
}
```

### 7.4 contextSources 展示增强

**当前状态：** `StudioAIPanel.tsx:187-198` 已有 `contextSources` badges 渲染逻辑（来自 RAG hits）。

**改造：**
- `contextSources` 扩展为包含所有来源：`['CLAUDE.md', '当前文件: docs/prd.md', '引用: docs/api.md', 'RAG: docs/design.md']`
- 按来源类型添加前缀标签：`宪法` / `当前文件` / `引用` / `相关`
- 在 AI 消息气泡底部以灰色小标签形式展示

---

## 八、AIHandler 集成改造

### 8.1 设计原则

1. **不破坏现有流式链路** — `handleStream()` / `handleChatLikeRequest()` 的核心流程不变
2. **替换 systemSegments 组装** — 将硬编码逻辑替换为 `ContextEngine.assembleContext()`
3. **保留 RAG 调用** — RAG 结果追加到上下文引擎组装结果之后
4. **保留 MEMORY** — Memory snapshot 追加到 RAG 之后（v2 迁移到第一层）

### 8.2 handleStream() / handleChatLikeRequest() 改造

```typescript
// Before:
const systemSegments: string[] = []
systemSegments.push('你是 Sibylla AI 助手...')
if (memorySnapshot) {
  systemSegments.push(memorySnapshot.slice(0, 5000))
}
const ragHits = await this.queryRagSafely(query)
systemSegments.push(...ragHits.map(h => h.content))

// After:
const assembled = await this.contextEngine.assembleContext({
  userMessage: query,
  currentFile: input.currentFile,
  manualRefs: input.manualRefs ?? []
})

const systemSegments: string[] = []
systemSegments.push(...assembled.layers.flatMap(l => l.sources.map(s => {
  return `--- ${s.layer === 'always' ? 'Always-Load' : 'Manual-Ref'}: ${s.filePath} ---\n${s.content}`
})))

// RAG (preserve existing behavior)
const ragHits = await this.queryRagSafely(query)
systemSegments.push(...ragHits.map(h => h.content))

// Memory (preserve existing behavior)
if (memorySnapshot) {
  systemSegments.push(memorySnapshot.slice(0, 5000))
}
```

### 8.3 contextSources 传递

```typescript
// After stream completes, collect all sources for the end event
const allSources = [
  ...assembled.sources.map(s => `${s.layer === 'always' ? '📄' : '📎'} ${s.filePath}`),
  ...ragHits.map(h => `🔍 ${h.source}`)
]

// Pass via AIStreamEnd or AIChatResponse
sender.send(IPC_CHANNELS.AI_STREAM_END, {
  ...endData,
  contextSources: allSources
})
```

### 8.4 ContextEngine 初始化

```typescript
// In AIHandler constructor or init method
this.contextEngine = new ContextEngine(
  this.fileManager,
  this.memoryManager,
  { maxContextTokens: 16000, systemPromptReserve: 2000 }
)
```

---

## 九、分步实施计划

> 共 7 步，每步产出可独立验证的增量。Step 1 为类型基础，Step 2-3 为核心模块，Step 4 为 IPC 集成，Step 5 为前端 UI，Step 6 为 AIHandler 联调，Step 7 为测试。

### Step 1：类型系统扩展（预估 0.5h）

**产出：** `src/shared/types.ts` 新增上下文引擎类型 + IPC 通道

**实施内容：**

1. 在 `IPC_CHANNELS` 中新增 1 个通道：
   - `AI_CONTEXT_FILES: 'ai:context:files'`

2. 新增类型接口：
   - `ContextLayerType` = `'always' | 'manual'`
   - `ContextSource`（filePath, content, tokenCount, layer）
   - `ContextLayer`（type, sources, totalTokens）
   - `AssembledContext`（layers, systemPrompt, totalTokens, budgetUsed, budgetTotal, sources, warnings）
   - `ContextEngineConfig`（maxContextTokens, systemPromptReserve, alwaysLoadFiles）
   - `ContextFileInfo`（path, name, type, extension）

3. 扩展 `AIChatRequest`：新增 `manualRefs?: string[]`

4. 扩展 `IPCChannelMap`：新增 `AI_CONTEXT_FILES` 映射

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] 新增类型可被 main / preload / renderer 三端 import

### Step 2：ContextEngine 核心模块（预估 3h）

**产出：** `src/main/services/context-engine.ts` 完整实现

**实施内容：**

1. 创建 `ContextEngine` 类：
   - 构造函数接收 `FileManager` + `MemoryManager` + 可选 `ContextEngineConfig`
   - 默认配置：`maxContextTokens: 16000`, `systemPromptReserve: 2000`, `alwaysLoadFiles: ['CLAUDE.md']`

2. 实现 `assembleContext(request)`:
   - `collectAlwaysLoad()` — CLAUDE.md + currentFile + Spec 文件
   - `collectManualRefs()` — @引用文件加载
   - `allocateBudget()` — Token 预算分配
   - `truncateToBudget()` — 超预算裁剪
   - 返回 `AssembledContext`

3. 实现 `extractFileReferences(message)`:
   - 正则 `/@\[\[([^\]]+)\]\]/g` 解析
   - 去重

4. 实现 `findMatchingFiles(query, limit)`:
   - 调用 `FileManager.listFiles()` 递归获取文件列表
   - 模糊匹配 + 排除系统目录 + 排除非文本文件
   - 按匹配度排序

5. 实现辅助方法：
   - `estimateTokens(text)` — CJK 感知字符计数（复用现有算法）
   - `safeLoadFile(path)` — 尝试读取文件，失败返回 null（不抛异常）
   - `loadSpecFiles(currentFile)` — Spec 文件自动识别

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] 离线手动测试：`assembleContext()` 正确加载 CLAUDE.md 和当前文件

### Step 3：Token 预算管理实现（预估 1.5h）

**产出：** ContextEngine 内部 Token 预算分配逻辑完善

**实施内容：**

1. `allocateBudget()` 实现：
   - 计算始终加载层 + 手动引用层的 token 总和
   - 与预算比较，返回 `BudgetAllocation`
   - 超限时按 70/30 比例分配给始终加载和手动引用

2. `truncateToBudget()` 实现：
   - 按句子边界截断
   - 保留文件开头部分
   - 追加裁剪标记

3. `warnings` 生成：
   - 超预算警告
   - 文件不存在警告
   - 文件过大裁剪警告

**验证标准：**
- [ ] 超预算时正确裁剪并生成警告
- [ ] 裁剪按句子边界，不截断到句子中间
- [ ] 始终加载层 + 手动引用层不超过预算

### Step 4：IPC 通道与 Preload Bridge（预估 1h）

**产出：** `ai:context:files` IPC 通道 + Preload API

**实施内容：**

1. `ai.handler.ts` 新增 `handleContextFiles` 方法：
   - 使用 `safeHandle` 包装
   - 校验输入参数（query: string, limit?: number）
   - 调用 `contextEngine.findMatchingFiles(query, limit)`
   - `register()` 中新增 `ipcMain.handle(AI_CONTEXT_FILES, ...)`

2. `preload/index.ts` 新增 `contextFiles` 方法：
   - `contextFiles: (query, limit?) => api.invoke(AI_CONTEXT_FILES, { query, limit })`

3. `ElectronAPI` interface 类型更新

4. `mockElectronAPI.ts` 新增 `contextFiles` mock：
   - 返回预定义文件列表

5. `tests/renderer/setup.ts` 新增 mock

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] Preload 编译无错误
- [ ] Mock 模式下 `contextFiles()` 返回正确结果

### Step 5：前端 @ 自动补全 UI（预估 2.5h）

**产出：** `FileAutocomplete` 组件 + `StudioAIPanel` 集成

**实施内容：**

1. 创建 `src/renderer/components/studio/FileAutocomplete.tsx`：
   - Props: query, onSelect, onClose, position
   - debounce 200ms 搜索
   - 键盘导航（上下键 + Enter + Esc）
   - 文件图标 + 路径展示
   - 暗色/亮色模式支持
   - 点击外部关闭（useEffect + clickOutside）

2. 修改 `StudioAIPanel.tsx`：
   - 新增 autocomplete 状态（visible, query, position）
   - textarea `onInput` 监听 `@` 触发
   - 集成 `FileAutocomplete` 组件
   - 选择后替换文本为 `@[[filePath]] `
   - 发送时提取 `manualRefs` 并传入回调

3. contextSources 展示增强：
   - 扩展来源前缀标签
   - 按来源类型差异化展示

**验证标准：**
- [ ] 输入 `@` 弹出文件列表
- [ ] 模糊搜索正常工作
- [ ] 选择文件后插入 `@[[文件路径]]`
- [ ] 键盘导航流畅
- [ ] 暗色/亮色模式正确显示

### Step 6：AIHandler 集成改造（预估 2h）

**产出：** ContextEngine 与 AI 对话链路完整贯通

**实施内容：**

1. `ai.handler.ts` 改造：
   - 初始化 `ContextEngine` 实例
   - `handleChatLikeRequest()` / `handleStream()` 中替换 systemSegments 组装逻辑
   - 保留 RAG + MEMORY 追加
   - `contextSources` 扩展为包含所有来源
   - 新增 `handleContextFiles()` 方法

2. 确保流式通道和非流式通道均使用新组装逻辑

3. 验证端到端流程：
   - 发送消息 → CLAUDE.md 自动加载 → AI 回复中展示引用来源

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] AI 对话时自动加载 CLAUDE.md
- [ ] AI 对话时自动加载当前编辑文件
- [ ] @引用文件内容正确传递到 AI
- [ ] 上下文超限时显示警告
- [ ] AI 回复中展示引用了哪些文件
- [ ] 现有 RAG / MEMORY 逻辑不受影响

### Step 7：测试编写（预估 2h）

**产出：** 完整测试套件

**实施内容：**

1. 创建 `tests/main/ContextEngine.test.ts`：
   - `assembleContext()` 始终加载 CLAUDE.md
   - `assembleContext()` 加载当前编辑文件
   - `assembleContext()` 加载手动引用文件
   - `assembleContext()` Spec 文件自动识别
   - 超预算时正确裁剪并生成警告
   - 文件不存在时不报错（safeLoadFile）
   - `extractFileReferences()` 正确解析 `@[[path]]` 语法
   - `findMatchingFiles()` 模糊搜索和排除规则

2. 创建 `tests/main/TokenBudgetManager.test.ts`：
   - 正常预算分配
   - 超预算按比例裁剪
   - 按句子边界截断
   - 空内容处理

3. 创建 `tests/renderer/FileAutocomplete.test.tsx`：
   - 输入查询后显示文件列表
   - 键盘导航
   - 选择文件后回调正确
   - Esc 关闭

4. 扩展现有测试 setup：
   - `tests/renderer/setup.ts` 新增 `contextFiles` mock

**验证标准：**
- [ ] 新增测试覆盖率 ≥ 70%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 现有测试全部通过（无回归）

---

## 十、验收标准与交付物

### 10.1 功能验收清单

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | AI 对话时自动加载 CLAUDE.md 到上下文 | 任务 spec 验收标准 1 | Step 2,6 | 检查 AI 回复中的 contextSources 标签 |
| 2 | AI 对话时自动加载当前编辑文件到上下文 | 验收标准 2 | Step 2,6 | 编辑某文件后发送消息，AI 能引用文件内容 |
| 3 | 用户输入 `@` 弹出文件自动补全 | 验收标准 3 | Step 5 | 在输入框输入 `@` 观察下拉菜单 |
| 4 | 选择文件后 AI 能读取该文件内容 | 验收标准 4 | Step 5,6 | `@[[CLAUDE.md]]` 后 AI 能引用内容 |
| 5 | 上下文超限时显示警告并截断最旧内容 | 验收标准 5 | Step 3,6 | 引用多个大文件后观察警告提示 |
| 6 | AI 回复中展示引用了哪些文件 | 验收标准 6 | Step 6 | 观察 AI 消息底部的 contextSources badges |
| 7 | Spec 文件在相关场景自动加载 | 验收标准 7 | Step 2,6 | 编辑 docs/ 下的文件时检查 contextSources |

### 10.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 上下文组装耗时 | < 500ms | 主进程日志计时 |
| 2 | @ 自动补全响应 | < 200ms | 用户输入到列表出现 |
| 3 | Token 估算耗时 | < 10ms | 单次 estimateTokens 计时 |
| 4 | 不影响流式首字延迟 | < 2s（与改造前一致） | 对比改造前后 TTFT |

### 10.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 新增代码测试覆盖率 ≥ 70% | Vitest 覆盖率 |
| 4 | 现有测试全部通过 | `npm run test` |
| 5 | 无 `any` 类型 | TypeScript strict check |

### 10.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/shared/types.ts` | 扩展 | 新增 1 通道 + 7 类型 |
| 2 | `src/main/services/context-engine.ts` | 新增 | ContextEngine 核心模块 |
| 3 | `src/main/ipc/handlers/ai.handler.ts` | 重构 | systemSegments 替换为 ContextEngine |
| 4 | `src/preload/index.ts` | 扩展 | 新增 contextFiles bridge |
| 5 | `src/renderer/components/studio/FileAutocomplete.tsx` | 新增 | @ 自动补全组件 |
| 6 | `src/renderer/components/studio/StudioAIPanel.tsx` | 改造 | 集成 FileAutocomplete + manualRefs |
| 7 | `src/renderer/store/aiChatStore.ts` | 扩展 | contextSources 来源扩展 |
| 8 | `src/renderer/dev/mockElectronAPI.ts` | 扩展 | contextFiles mock |
| 9 | `tests/main/ContextEngine.test.ts` | 新增 | 核心模块测试 |
| 10 | `tests/main/TokenBudgetManager.test.ts` | 新增 | 预算管理测试 |
| 11 | `tests/renderer/FileAutocomplete.test.tsx` | 新增 | 自动补全组件测试 |
| 12 | `tests/renderer/setup.ts` | 扩展 | contextFiles mock |

---

## 十一、风险评估与回滚策略

### 11.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| CLAUDE.md 过大导致预算不足 | 中 | 中 | truncateToBudget 按句子边界裁剪；UI 展示裁剪警告；v1 默认 16000 tokens 足够覆盖大多数 CLAUDE.md |
| @ 自动补全 textarea 光标位置计算不精确 | 低 | 中 | 使用 textarea selectionStart 计算；fallback 到固定偏移 |
| AIHandler 重构导致流式链路中断 | 高 | 低 | 保留 RAG + MEMORY 追加逻辑不变；仅替换 systemSegments 组装部分；逐步替换，每步验证 |
| `findMatchingFiles` 大型 workspace 性能差 | 中 | 低 | 限制搜索深度和文件数量；排除系统目录；debounce 200ms |
| Spec 文件全部加载导致 token 溢出 | 中 | 中 | Spec 文件参与全局预算分配，超限时优先裁剪 Spec 文件 |

### 11.2 回滚策略

| 变更 | 回滚方式 |
|------|---------|
| `src/shared/types.ts` 新增类型和通道 | 删除新增行即可，无破坏性 |
| `context-engine.ts` | 独立新增文件，可安全删除 |
| `ai.handler.ts` systemSegments 替换 | git revert 恢复硬编码模式 |
| `preload/index.ts` contextFiles 新增 | 删除新增方法即可 |
| `FileAutocomplete.tsx` | 独立新增文件，可安全删除 |
| `StudioAIPanel.tsx` 改造 | git revert 恢复原始 textarea |

**最小回滚方案：** 如果 ContextEngine 集成存在问题，可仅回滚 `ai.handler.ts` 恢复原始 systemSegments 组装。新增的类型、ContextEngine 模块和前端组件可保留，不影响现有功能。

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
**更新记录：**
- 2026-04-18 — 初始创建
