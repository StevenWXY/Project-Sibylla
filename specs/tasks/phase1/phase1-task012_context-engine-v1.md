# 上下文引擎 v1

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK012 |
| **任务标题** | 上下文引擎 v1 |
| **所属阶段** | Phase 1 - AI 系统 MVP (Sprint 3) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现三层上下文模型的第一层（始终加载）和第三层（手动引用），让 AI 能够理解项目背景而不需要用户重复解释。

### 背景

当前 `ai.handler.ts` 的上下文组装非常简单（硬编码 system prompt + 用户消息 + MEMORY 截断 + RAG 命中）。需要抽象为独立的 `ContextEngine` 模块，支持：
- 自动加载 CLAUDE.md 和当前编辑文件
- `@文件名` 解析与自动补全
- Token 预算管理与截断策略
- 与现有 MemoryManager、LocalRagEngine 集成

### 范围

**包含：**
- ContextEngine 模块（`src/main/services/context-engine.ts`）
- 始终加载层：CLAUDE.md + 当前文件
- 手动引用层：`@文件名` 解析 + 自动补全
- Token 预算管理（estimateTokens + truncate）
- Spec 文件自动识别（CLAUDE.md / requirements / design / tasks）
- 前端 `@` 自动补全 UI
- 上下文来源展示（AI 回复中显示引用了哪些文件）

**不包含：**
- 语义搜索自动召回（Phase 2 Sprint 4 上下文引擎 v2）
- 向量检索上下文注入

## 技术要求

### 架构设计

```
ContextEngine
├── Layer 1: Always-Load
│   ├── CLAUDE.md（项目宪法）
│   └── 当前编辑文件内容
├── Layer 3: Manual-Reference
│   ├── @文件名 解析
│   └── 文件内容加载
├── Token Budget Manager
│   ├── estimateTokens()
│   ├── allocateBudget()
│   └── truncateOldest()
└── Source Tracker
    ├── 记录引用的文件列表
    └── 返回给前端展示
```

### 核心类型

```typescript
// src/main/services/context-engine.ts

export interface ContextLayer {
  type: 'always' | 'manual'
  sources: ContextSource[]
  totalTokens: number
}

export interface ContextSource {
  filePath: string
  content: string
  tokenCount: number
  layer: 'always' | 'manual'
}

export interface AssembledContext {
  layers: ContextLayer[]
  systemPrompt: string
  totalTokens: number
  budgetUsed: number
  budgetTotal: number
  sources: ContextSource[]
  warnings: string[]
}

export interface ContextEngineConfig {
  maxContextTokens: number        // default: 16000
  systemPromptReserve: number     // default: 2000
  alwaysLoadFiles: string[]       // default: ['CLAUDE.md']
}

export class ContextEngine {
  constructor(
    private readonly fileManager: FileManager,
    private readonly config: ContextEngineConfig
  ) {}

  async assembleContext(request: ContextRequest): Promise<AssembledContext>
  extractFileReferences(message: string): string[]
  async findMatchingFiles(query: string, limit?: number): Promise<FileInfo[]>
}
```

### IPC 通道扩展

```typescript
// 新增 IPC 通道
AI_CONTEXT_FILES: 'ai:context:files'     // @ 文件自动补全查询
```

### 前端 @ 自动补全

在 `StudioAIPanel.tsx` 的输入框中，当用户输入 `@` 时：
1. 弹出文件列表下拉菜单
2. 支持模糊搜索
3. 选择文件后插入 `@[[文件路径]]`
4. AI 发送时将引用路径传给上下文引擎

## 验收标准

- [ ] AI 对话时自动加载 CLAUDE.md 到上下文
- [ ] AI 对话时自动加载当前编辑文件到上下文
- [ ] 用户输入 `@` 弹出文件自动补全
- [ ] 选择文件后 AI 能读取该文件内容
- [ ] 上下文超限时显示警告并截断最旧内容
- [ ] AI 回复中展示引用了哪些文件（contextSources）
- [ ] Spec 文件（requirements/design/tasks）在相关场景自动加载

## 依赖关系

### 前置依赖

- [x] FileManager（文件读取）
- [x] AIHandler（集成点）
- [ ] TASK011（流式响应基础）

### 被依赖任务

- TASK014（Skill 系统）— Skill 内容通过上下文引擎注入

## 参考文档

- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — 需求 2.1、2.6
- [`specs/design/memory-system-design.md`](../../design/memory-system-design.md) — 三层上下文模型

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
