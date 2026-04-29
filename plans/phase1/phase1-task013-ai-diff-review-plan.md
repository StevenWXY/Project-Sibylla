# PHASE1-TASK013: AI 文件修改 Diff 审查 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task013_ai-diff-review.md](../specs/tasks/phase1/phase1-task013_ai-diff-review.md)
> 创建日期：2026-04-18
> 最后更新：2026-04-18

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK013 |
| **任务标题** | AI 文件修改 Diff 审查 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ PHASE1-TASK011（AI 流式响应）、✅ PHASE1-TASK009（版本历史 Diff 组件可参考）、✅ PHASE1-TASK005（自动保存 commit） |

### 目标

实现 AI 建议修改文件时的完整链路：AI 响应中解析 diff 标记 → 展示 diff 预览 → 用户确认 → 写入文件 → 触发自动保存和提交。

### 核心命题

当前 AI 对话中 `buildDiffProposal()` 仅通过简单的正则提取 before/after 文本，`toDiffLines()` 不使用 `diff` 库仅做前 4 行的粗略对比，`applyDiffProposal()` 缺少用户确认环节直接写入文件。这违反了 CLAUDE.md 红线："AI 输出涉及文件修改时，必须展示 diff 预览，禁止静默写入"。

本任务要建立从 AI 响应 diff 代码块解析到用户确认写入的完整、安全的文件修改审查链路。

### 范围边界

**包含：**
- AI 响应中 `\`\`\`diff:路径` 代码块解析器（支持单文件和多文件）
- `ParsedFileDiff` 结构化 diff 类型（hunk 级、行级）
- Diff 预览 UI 增强（行级增删标记、行号、语法高亮容器）
- 多文件修改列表展示
- 用户确认流程（应用/编辑/取消）
- 编辑模式（可编辑 diff 视图）
- 写入文件 + 触发自动保存（复用 `file:write` + AutoSaveManager）
- 修改失败回滚（利用 Git 版本历史）
- `DiffProposal` 类型升级（从 `before/after` 升级为 `ParsedFileDiff[]`）

**不包含：**
- 实时协同 diff（CRDT）
- 复杂的三方合并
- AI 响应流式中增量 diff 解析（MVP 阶段等流式完成后一次性解析）
- 语法高亮着色（仅容器级，不做 Token 级着色）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；所有异步操作必须有错误处理；关键操作结构化日志；"AI 输出涉及文件修改时，必须展示 diff 预览，禁止静默写入"；"所有写入操作必须先写临时文件再原子替换" |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离；Git 抽象层 `saveFile()` 接口 |
| 数据模型与 API | `specs/design/data-and-api.md` | IPC 通信模式 invoke/handle + send/on；`file:write` 原子写入 |
| 需求规格 | `specs/requirements/phase1/sprint3-ai-mvp.md` | 需求 2.4（AI 文件修改能力）；技术选型 `diff-match-patch` → 实际使用 `diff` 库 |
| 任务规格 | `specs/tasks/phase1/phase1-task013_ai-diff-review.md` | 核心类型 `ParsedFileDiff`/`DiffHunk`/`DiffChange`；8 条验收标准 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 品牌色 Indigo-500；>2s 操作需进度反馈；暗色/亮色模式支持 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `file:write` invoke/handle 调用模式；IPC 类型安全；错误处理 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | `diffReviewStore` 设计（diff 审查状态管理）；selector 精确订阅；devtools 中间件 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | `ParsedFileDiff`/`DiffHunk`/`DiffChange` 严格类型定义；类型守卫 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 组件 memo 优化（Diff 渲染可能较重）；useCallback 稳定引用；虚拟化长 diff |
| `isomorphic-git-integration` | `.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md` | 回滚策略中复用 Git 抽象层接口 |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| AIDiffPreviewCard | `sibylla-desktop/src/renderer/components/studio/AIDiffPreviewCard.tsx` | ⚠️ 需重写 | 当前仅简单 DiffLine 渲染，无行号/hunk/expansion；DiffLine 类型用 `'remove'` 与 git.types 的 `'delete'` 不一致 |
| DiffProposal 类型 | `sibylla-desktop/src/renderer/components/studio/types.ts` | ⚠️ 需扩展 | 当前仅有 `targetPath/before/after`；需升级为支持多文件 `ParsedFileDiff[]` |
| ChatMessage 类型 | `sibylla-desktop/src/renderer/components/studio/types.ts` | ⚠️ 需扩展 | `diffProposal` 字段类型需从 `DiffProposal \| null` 改为 `ParsedFileDiff[]` |
| buildDiffProposal | `sibylla-desktop/src/renderer/pages/WorkspaceStudioPage.tsx` | ⚠️ 需重写 | 当前用正则提取 before/after；需改为 diff 代码块解析器 |
| toDiffLines | `sibylla-desktop/src/renderer/components/studio/StudioAIPanel.tsx` | ⚠️ 需替换 | 当前仅取前 4 行粗略对比；需使用 `diff` 库计算精确 hunks |
| applyDiffProposal | `sibylla-desktop/src/renderer/pages/WorkspaceStudioPage.tsx` | ⚠️ 需重写 | 当前直接写入无确认；需增加 diff 审查 UI + 用户确认 |
| DiffHunkView | `sibylla-desktop/src/renderer/components/version-history/DiffHunkView.tsx` | ✅ 可复用 | TASK009 产出的 DiffHunk 渲染组件，支持行号+增删高亮 |
| DiffHunk/DiffLine types | `sibylla-desktop/src/shared/types/git.types.ts` | ✅ 可复用 | `DiffHunk { oldStart, oldLines, newStart, newLines, lines: DiffLine[] }` + `DiffLine { type, content }` |
| GitAbstraction.computeDiffHunks | `sibylla-desktop/src/main/services/git-abstraction.ts` | ✅ 可参考 | 使用 `structuredPatch` 计算结构化 diff hunks |
| `diff` 库 | 已安装 `diff@^8.0.3` + `@types/diff@^7.0.2` | ✅ 可用 | `structuredPatch`/`createTwoFilesPatch` 用于精确 diff 计算 |
| file:write IPC | `sibylla-desktop/src/shared/types.ts` | ✅ 可用 | 支持 `FileWriteOptions { atomic, createDirs }` |
| AutoSaveManager | `sibylla-desktop/src/main/services/auto-save-manager.ts` | ✅ 可用 | diff 应用后通过 `file:write` 触发，AutoSaveManager 自动 debounce + commit |
| aiChatStore | `sibylla-desktop/src/renderer/store/aiChatStore.ts` | ⚠️ 需扩展 | `finalizeAssistant` 不处理 diffProposal；当前通过 `setState` 手动 patch |
| useAIStream hook | `sibylla-desktop/src/renderer/hooks/useAIStream.ts` | ✅ 可用 | `onStreamEnd` 回调中触发 diff 提取 |
| StudioAIPanel | `sibylla-desktop/src/renderer/components/studio/StudioAIPanel.tsx` | ⚠️ 需修改 | Diff 预览渲染逻辑需对接新组件；回调需适配多文件 |

### 2.4 被依赖任务

无直接被依赖任务。

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `diff` ^8.0.3 — Diff 计算（`structuredPatch`/`createTwoFilesPatch`）
- `zustand` ^5.0.11 — 状态管理
- `lucide-react` ^0.577.0 — 图标（Check, X, Edit3, ChevronDown, ChevronUp, FileText, AlertTriangle）
- `clsx` + `tailwind-merge` — 样式工具

**不引入 `diff-match-patch`**——虽然 sprint3 需求文档提到，但 `diff` 库已安装且功能完备，无需重复引入。

---

## 三、现有代码盘点与差距分析

### 3.1 当前 AI 文件修改数据流

```
渲染进程 WorkspaceStudioPage       主进程                      文件系统
    │                               │                           │
    │ 1. onStreamEnd callback       │                           │
    │ 2. buildDiffProposal(content) │                           │
    │    ├ extractFirstCodeBlock()  │                           │
    │    └ regex: /替换.*为/g       │                           │
    │ 3. setState: diffProposal=    │                           │
    │    {targetPath, before,after} │                           │
    │                               │                           │
    │ 4. 用户点击"应用"             │                           │
    │ 5. file.read(targetPath) ────>│ fileManager.read() ──────>│
    │◀── currentContent ───────────│                           │
    │ 6. applyProposalToContent()   │                           │
    │    new RegExp(before).replace │                           │
    │ 7. file.write(targetPath,new)│ fileManager.write(atomic)─>│
    │◀── void ─────────────────────│ autoSaveManager ──────────>│ git commit
    │                               │                           │
```

**问题清单：**

| # | 问题 | 严重程度 | 来源 |
|---|------|---------|------|
| 1 | `buildDiffProposal` 用中文正则匹配 AI 响应（`/替换.*为/g`），脆弱且不可靠 | 高 | WorkspaceStudioPage.tsx:122-155 |
| 2 | `toDiffLines()` 不使用 diff 库，仅取 before/after 前 4 行对比，diff 预览质量极差 | 高 | StudioAIPanel.tsx:32-54 |
| 3 | `DiffProposal` 仅存 before/after 字符串，无 hunk/行号信息 | 高 | types.ts |
| 4 | `AIDiffPreviewCard.DiffLine.type` 用 `'remove'`，与 git.types 的 `'delete'` 不一致 | 中 | AIDiffPreviewCard.tsx |
| 5 | 用户点击"应用"后无 diff 审查流程，直接写入文件 | 高 | WorkspaceStudioPage.tsx:911-961 |
| 6 | 不支持多文件修改 | 中 | buildDiffProposal 仅提取单个 |
| 7 | `applyProposalToContent()` 用 `new RegExp(escapeRegex(before))` 替换，可能误匹配 | 中 | WorkspaceStudioPage.tsx:249-257 |
| 8 | 写入失败无回滚机制 | 中 | 无回滚代码 |

### 3.2 目标数据流

```
渲染进程 WorkspaceStudioPage       主进程                      文件系统
    │                               │                           │
    │ 1. onStreamEnd callback       │                           │
    │ 2. parseDiffBlocks(content)   │                           │
    │    ├ 提取 ```diff:路径 代码块 │                           │
    │    ├ structuredPatch 计算hunks│                           │
    │    └ 返回 ParsedFileDiff[]    │                           │
    │                               │                           │
    │ 3. setState: diffProposals=   │                           │
    │    ParsedFileDiff[]           │                           │
    │                               │                           │
    │ 4. DiffReviewPanel 展示       │                           │
    │    ├ 多文件列表（如有多个）   │                           │
    │    ├ 行级 Diff 预览           │                           │
    │    └ 应用/编辑/取消 按钮      │                           │
    │                               │                           │
    │ 5a. 用户点击"应用"            │                           │
    │    file.write(path,fullNew,   │                           │
    │      {atomic:true}) ─────────>│ fileManager.write() ─────>│
    │                               │ autoSaveManager ──────────>│ git commit
    │                               │                           │
    │ 5b. 用户点击"编辑"            │                           │
    │    打开可编辑 diff 视图       │                           │
    │    → 用户修改后应用           │                           │
    │                               │                           │
    │ 5c. 写入失败                  │                           │
    │    显示错误 → 用户可选回滚    │                           │
    └───────────────────────────────┘                           │
```

### 3.3 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| Diff 代码块解析 | ⚠️ `extractFirstCodeBlock()` + 中文正则 | 无 `\`\`\`diff:路径` 格式解析 | `parseDiffBlocks()` 解析器 |
| 结构化 Diff 计算 | ❌ `toDiffLines()` 仅前 4 行粗略对比 | 无 hunk 级 diff | 使用 `diff` 库 `structuredPatch` |
| 多文件修改 | ❌ 仅支持单个 | 无多文件提取 | `ParsedFileDiff[]` 数组 |
| Diff 预览 UI | ⚠️ `AIDiffPreviewCard` 基础渲染 | 无行号/hunk/expansion/折叠 | `DiffReviewPanel` + 复用 `DiffHunkView` |
| 多文件列表 | ❌ 无 | 无多文件选择 UI | `DiffFileList` 组件 |
| 用户确认流程 | ❌ 点击"应用"直接写入 | 无审查步骤 | 确认流程 + loading + 结果反馈 |
| 编辑模式 | ⚠️ `editFirst=true` 仅设置编辑器内容 | 无 diff 内编辑 | 可编辑 diff 视图 |
| 写入失败回滚 | ❌ 无 | 无回滚机制 | Git 版本回退选项 |
| DiffLine 类型统一 | ⚠️ `'remove'` vs `'delete'` | 不一致 | 统一为 `git.types` 的 `'delete'` |

### 3.4 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/renderer/utils/diffParser.ts` | 新增 | AI 响应 diff 代码块解析器（提取 + 计算 hunks） |
| 2 | `src/renderer/components/studio/DiffReviewPanel.tsx` | 新增 | Diff 审查主面板（多文件列表 + 预览 + 操作按钮） |
| 3 | `src/renderer/components/studio/DiffFileList.tsx` | 新增 | 多文件修改列表组件 |
| 4 | `src/renderer/components/studio/EditableDiffView.tsx` | 新增 | 可编辑 diff 视图组件 |
| 5 | `src/renderer/store/diffReviewStore.ts` | 新增 | Diff 审查 Zustand store |
| 6 | `tests/renderer/diffParser.test.ts` | 新增 | 解析器测试 |
| 7 | `tests/renderer/DiffReviewPanel.test.tsx` | 新增 | 面板测试 |
| 8 | `tests/renderer/diffReviewStore.test.ts` | 新增 | Store 测试 |

### 3.5 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/renderer/components/studio/types.ts` | `DiffProposal` 升级为 `ParsedFileDiff[]`；`ChatMessage.diffProposal` 类型更新 | 高 — 类型变更影响面广 |
| 2 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 重写 `buildDiffProposal` → `parseDiffBlocks`；重写 `applyDiffProposal` → 确认流程；`onStreamEnd` 回调适配 | 高 — 核心变更 |
| 3 | `src/renderer/components/studio/StudioAIPanel.tsx` | 替换 `toDiffLines()` + `AIDiffPreviewCard` → `DiffReviewPanel`；适配多文件 diff 回调 | 中 — UI 变更 |
| 4 | `src/renderer/components/studio/AIDiffPreviewCard.tsx` | 废弃（由 `DiffReviewPanel` 替代）或保留为内部渲染组件 | 低 — 可选保留 |
| 5 | `src/renderer/store/aiChatStore.ts` | `finalizeAssistant` 支持 `diffProposals` 字段 | 低 — 新增字段 |
| 6 | `src/renderer/hooks/useAIStream.ts` | `onStreamEnd` 回调签名扩展（传递完整 AI 响应内容用于 diff 解析） | 低 — 参数扩展 |
| 7 | `src/renderer/dev/mockElectronAPI.ts` | 无变更（复用现有 `file:write` mock） | 无 |
| 8 | `tests/renderer/setup.ts` | 无变更（复用现有 mock） | 无 |

### 3.6 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/main/services/git-abstraction.ts` | 不直接调用；写入通过 `file:write` IPC，AutoSaveManager 自动处理 commit |
| `src/main/ipc/handlers/ai.handler.ts` | 流式推送完成后由渲染进程解析 diff，主进程不参与 diff 解析 |
| `src/shared/types/git.types.ts` | 复用现有 `DiffHunk`/`DiffLine` 类型，不修改 |
| `src/renderer/components/version-history/DiffHunkView.tsx` | 直接复用，不修改 |
| `src/preload/index.ts` | 复用现有 `file:write`/`file:read` API，无需扩展 |

---

## 四、类型系统设计

### 4.1 设计原则

1. **最大化复用** — `DiffHunk`/`DiffLine` 直接复用 `git.types.ts` 已有定义（TASK009 产出），不新建冗余类型
2. **渲染进程类型映射** — `ParsedFileDiff` 在渲染进程计算，不涉及主进程 IPC
3. **向后兼容** — `DiffProposal` 旧类型保留但标记 `@deprecated`，新增 `diffProposals` 字段

### 4.2 ParsedFileDiff 类型（渲染进程）

```typescript
// src/renderer/components/studio/types.ts 新增

import type { DiffHunk } from '../../shared/types/git.types'

export interface ParsedFileDiff {
  filePath: string
  hunks: DiffHunk[]
  fullNewContent: string
  fullOldContent: string
  stats: {
    additions: number
    deletions: number
  }
}
```

**设计决策：**
- `fullNewContent` 存储完整的修改后文件内容，用于写入文件时直接使用
- `fullOldContent` 存储当前文件内容，用于回滚
- `stats` 提供增删行计数，用于列表展示摘要
- `DiffHunk` 直接复用 `git.types.ts`（`{ oldStart, oldLines, newStart, newLines, lines: DiffLine[] }`）
- `DiffLine.type` 统一使用 `'add' | 'delete' | 'context'`（与 git.types 一致，废弃 AIDiffPreviewCard 的 `'remove'`）

### 4.3 ChatMessage 类型升级

```typescript
// src/renderer/components/studio/types.ts 修改

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  contextSources?: string[]
  streaming?: boolean
  // 旧字段保留兼容（deprecated）
  /** @deprecated Use diffProposals instead */
  diffProposal?: DiffProposal | null
  // 新字段
  diffProposals?: ParsedFileDiff[]
}
```

**迁移策略：**
- `diffProposal` 标记 `@deprecated` 但不删除，现有代码中引用处逐步迁移
- `diffProposals` 为数组，支持多文件
- `onStreamEnd` 回调中同时设置 `diffProposal`（兼容）和 `diffProposals`（新）

### 4.4 DiffReviewState 类型

```typescript
// src/renderer/store/diffReviewStore.ts

interface DiffReviewState {
  proposals: readonly ParsedFileDiff[]
  activeIndex: number
  isApplying: boolean
  isEditing: boolean
  editingContent: string
  appliedPaths: readonly string[]
  failedPath: string | null
  errorMessage: string | null
}

interface DiffReviewActions {
  setProposals: (proposals: ParsedFileDiff[]) => void
  setActiveIndex: (index: number) => void
  applyProposal: (messageId: string) => Promise<void>
  applyAll: (messageId: string) => Promise<void>
  startEditing: () => void
  cancelEditing: () => void
  updateEditingContent: (content: string) => void
  applyEdited: (messageId: string) => Promise<void>
  dismiss: () => void
  clearError: () => void
}
```

**设计决策：**
- `appliedPaths` 追踪已成功写入的文件（多文件场景下逐个应用）
- `failedPath` + `errorMessage` 记录写入失败的文件（提供回滚选项）
- `isEditing` + `editingContent` 管理可编辑 diff 视图状态
- 不使用 persist——审查状态是运行时临时状态

---

## 五、Diff 解析器设计

### 5.1 解析策略

AI 响应中的 diff 标记格式约定（与 sprint3 需求 2.4 一致）：

````
```diff:path/to/file.md
- 旧内容
+ 新内容
```
````

解析器需同时支持：
1. **标准格式**：`\`\`\`diff:路径` 代码块（首选）
2. **Fallback**：完整文件重写代码块（`\`\`\`markdown:path/to/file.md` 或纯 `\`\`\`` + 路径注释）

### 5.2 parseDiffBlocks 函数签名

```typescript
// src/renderer/utils/diffParser.ts

import type { DiffHunk } from '../../shared/types/git.types'
import { structuredPatch } from 'diff'

export interface ParsedFileDiff {
  filePath: string
  hunks: DiffHunk[]
  fullNewContent: string
  fullOldContent: string
  stats: { additions: number; deletions: number }
}

/**
 * Parse AI response content for file modification diff blocks.
 * Supports ` ```diff:filepath` code blocks and full-rewrite code blocks.
 */
export function parseDiffBlocks(
  aiContent: string,
  currentFilePath: string,
  currentFileContent: string
): ParsedFileDiff[]
```

### 5.3 解析流程

```
parseDiffBlocks(content, currentFilePath, currentFileContent)
  │
  ├─ 1. extractDiffCodeBlocks(content)
  │     正则: /```diff:([^\n]+)\n([\s\S]*?)```/g
  │     返回: Array<{filePath: string, diffBody: string}>
  │
  ├─ 2. 对每个 diff code block:
  │     ├─ extractFullNewContent(diffBody)
  │     │   移除 - 行，保留 + 行和上下文行
  │     │   返回完整新文件内容
  │     │
  │     ├─ readCurrentFile(filePath) 或用传入的 currentFileContent
  │     │   通过 window.electronAPI.file.read() 异步读取
  │     │   但解析器在渲染进程，需要在外部读取后传入
  │     │
  │     └─ computeDiffHunks(oldContent, newContent)
  │         使用 diff 库 structuredPatch
  │         返回 DiffHunk[] + stats
  │
  ├─ 3. Fallback: extractFirstCodeBlock(content)
  │     若无 diff: 代码块，尝试提取完整重写
  │     用当前文件内容作为 oldContent
  │     返回 ParsedFileDiff
  │
  └─ 4. 返回 ParsedFileDiff[]
```

### 5.4 extractDiffCodeBlocks 实现

```typescript
function extractDiffCodeBlocks(content: string): RawDiffBlock[] {
  const blocks: RawDiffBlock[] = []
  const regex = /```diff:([^\n]+)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ filePath: match[1].trim(), diffBody: match[2] })
  }
  return blocks
}
```

**关键约束：** lazy match `[\s\S]*?` 避免贪婪匹配；空 diff body 返回空 hunks。

### 5.5 diffBody → fullNewContent 转换

```typescript
function applyDiffBody(diffBody: string): string {
  const lines = diffBody.split('\n')
  const result: string[] = []
  for (const line of lines) {
    if (line.startsWith('+')) result.push(line.slice(1))
    else if (line.startsWith('-')) { /* skip */ }
    else if (line.startsWith(' ')) result.push(line.slice(1))
    else result.push(line)
  }
  return result.join('\n')
}
```

两条路径：完整 diff（无上下文行，纯 `+`/`-`）→ `applyDiffBody()` 直接重建；片段 diff（有上下文行）→ patch 到原文。

```typescript
function isNewContentComplete(diffBody: string): boolean {
  const lines = diffBody.split('\n')
  const contextLines = lines.filter(l => l.startsWith(' ') || (!l.startsWith('+') && !l.startsWith('-') && l.trim().length > 0))
  return contextLines.length === 0 && lines.some(l => l.startsWith('+'))
}
```

### 5.6 computeDiffHunks 实现

使用 `diff` 库 `structuredPatch`，输出与 GitAbstraction 同格式的 `DiffHunk[]`：

```typescript
function computeDiffHunks(oldContent: string, newContent: string): { hunks: DiffHunk[]; stats: { additions: number; deletions: number } }
```

核心逻辑：`structuredPatch()` → 遍历 `patch.hunks`，每行按前缀 `+`/`-`/` ` 映射为 `DiffLine { type: 'add'|'delete'|'context', content }`，同时统计增删行数。

### 5.7 异步主入口

```typescript
export async function parseDiffBlocksWithFileRead(
  aiContent: string, currentFilePath: string, currentFileContent: string
): Promise<ParsedFileDiff[]>
```

流程：`extractDiffCodeBlocks()` → 对每个 block 异步读取文件（当前文件直接用参数，其他文件走 `file:read` IPC）→ `applyDiffBody` 或 `applyPatchToContent` → `computeDiffHunks` → 返回 `ParsedFileDiff[]`。无 diff block 时走 `parseFallbackCodeBlock` fallback。解析失败返回空数组。

---

## 六、Diff 预览 UI 增强设计

### 6.1 组件层级

```
StudioAIPanel (修改 — 替换旧 diff 预览)
└── DiffReviewPanel (新增 — 审查主面板)
    ├── DiffFileList (新增 — 多文件列表，仅多文件时显示)
    ├── DiffHunkView (复用 TASK009 — 行级 diff 渲染)
    ├── EditableDiffView (新增 — 可编辑 diff 视图)
    └── 操作按钮组 (应用/全部应用/编辑/取消)
```

### 6.2 DiffReviewPanel 组件

**文件：** `src/renderer/components/studio/DiffReviewPanel.tsx`

```
Props:
  proposals: ParsedFileDiff[]
  messageId: string
  onApply: (messageId: string, filePath: string) => Promise<void>
  onApplyAll: (messageId: string) => Promise<void>
  onEdit: (messageId: string) => void
  onDismiss: () => void

布局:
┌─────────────────────────────────────────────────┐
│ 📄 AI 建议修改以下文件                    [收起] │  ← header
├─────────────────────────────────────────────────┤
│                                                 │
│  DiffFileList (仅 proposals.length > 1)         │
│  ┌────────────┬────────────┬────────────┐       │
│  │ ● prd.md   │ spec.md    │ config.md  │       │  ← 文件 tab，+3/-1 标注
│  └────────────┴────────────┴────────────┘       │
│                                                 │
│  当前文件: prd.md  (+3 -1)                      │  ← 文件名 + 统计
│  ┌─────────────────────────────────────────┐    │
│  │ DiffHunkView                             │    │
│  │ - 旧内容行 (红色)                       │    │
│  │ + 新增内容行 (绿色)                     │    │
│  │   上下文行 (灰色)                       │    │
│  │ ...                                     │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   ✅ 应用   │ │ ✏️ 编辑应用  │ │   ✕ 取消  │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
│                                                 │
│  若 proposals.length > 1:                       │
│  ┌─────────────────────────────────────────────┐│
│  │         全部应用 (3 个文件)                  ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘

状态映射:
  isApplying → 按钮显示 Loader2 + disabled
  isEditing → 显示 EditableDiffView 替代 DiffHunkView
  failedPath → 显示错误提示 + 回滚选项
```

**设计决策：**
- 多文件场景使用 tab 式列表（非卡片列表），与编辑器 tab 风格一致
- `DiffHunkView` 直接复用 TASK009 产出，不重复开发
- 操作按钮使用品牌色 Indigo（应用）、outline 风格（编辑）、gray（取消）
- 暗色模式通过 Tailwind `dark:` variant 支持

### 6.3 DiffFileList 组件

水平 tab 列表。Props: `proposals`, `activeIndex`, `onSelect`, `appliedPaths`。每个 tab 显示 `path.basename` + `+N/-N` 统计。选中态 `border-indigo-500`，已应用 `opacity-50 line-through`。

### 6.4 EditableDiffView 组件

Props: `initialContent`, `filePath`, `onContentChange`, `onCancel`。MVP 使用 `<textarea>` + 等宽字体 + 行号。编辑内容存于 `diffReviewStore.editingContent`，用户编辑后点击"应用编辑"→ 写入文件。

### 6.5 与 StudioAIPanel 的集成

```typescript
// After (替换旧的 AIDiffPreviewCard):
{message.diffProposals && message.diffProposals.length > 0 && (
  <DiffReviewPanel proposals={message.diffProposals} messageId={message.id}
    onApply={handleApplyDiff} onApplyAll={handleApplyAll}
    onEdit={handleEditDiff} onDismiss={handleDismissDiff} />
)}
```

兼容处理：若 `diffProposals` 不存在但 `diffProposal` 存在，将旧格式转换为 `ParsedFileDiff[]`。

---

## 七、文件写入链路与回滚设计

### 7.1 写入流程

```
用户点击"应用"
  │
  ├─ 1. diffReviewStore.setApplying(true)
  ├─ 2. 获取 ParsedFileDiff.fullNewContent
  ├─ 3. window.electronAPI.file.write(
  │      proposal.filePath,
  │      fullNewContent,
  │      { atomic: true, createDirs: true }
  │    )
  ├─ 4a. 成功:
  │      ├─ diffReviewStore.markApplied(proposal.filePath)
  │      ├─ AutoSaveManager 自动检测 file:write → debounce → git commit
  │      └─ 若全部应用完 → 自动关闭面板
  ├─ 4b. 失败:
  │      ├─ diffReviewStore.setError(filePath, errorMessage)
  │      ├─ 显示错误横幅 + "回滚已应用的修改" 选项
  │      └─ 用户可选回滚（逐个恢复 fullOldContent）
  └─ 5. diffReviewStore.setApplying(false)
```

### 7.2 回滚策略

**文件级回滚：** 写入失败时，对已成功写入的文件使用 `fullOldContent` 恢复：

```typescript
async function rollbackApplied(appliedPaths: string[], proposals: ParsedFileDiff[]): Promise<void> {
  for (const appliedPath of appliedPaths) {
    const proposal = proposals.find(p => p.filePath === appliedPath)
    if (proposal) {
      await window.electronAPI.file.write(
        proposal.filePath,
        proposal.fullOldContent,
        { atomic: true }
      )
    }
  }
}
```

**版本历史回滚（备选）：** 若 `fullOldContent` 不可靠（如文件在应用期间被其他操作修改），使用 Git 版本回退：
- `window.electronAPI.git.restore(filePath, lastCommitSha)` — 恢复到最后一个 commit

**设计决策：**
- 优先使用 `fullOldContent` 内存回滚（快速、可靠）
- 若内存回滚失败（内容已变化），提示用户通过"查看历史"手动恢复
- 不自动执行 git revert（可能影响其他文件）

### 7.3 "全部应用"流程（多文件场景）

```
用户点击"全部应用"
  │
  ├─ for each proposal:
  │    ├─ file.write(proposal.filePath, fullNewContent, { atomic: true })
  │    ├─ 成功 → markApplied(proposal.filePath)
  │    └─ 失败 → setError(proposal.filePath, error) + 中断循环
  │
  ├─ 若有失败:
  │    显示 "X/Y 个文件已应用，Z 个失败"
  │    提供 "回滚已应用的修改" 按钮
  │
  └─ 若全部成功:
       自动关闭面板 + 通知 "已应用 N 个文件修改"
```

### 7.4 与 AutoSaveManager 的交互

- `file:write` 写入后，FileHandler 发出 `file:autoSaved` 事件
- AutoSaveManager debounce 1s + batch window 5s → 自动 commit
- Diff 审查面板无需直接触发 commit，完全依赖 AutoSaveManager
- **但** WorkspaceStudioPage 的内联 auto-save（900ms debounce）可能与 AutoSaveManager 冲突——建议在 diff 应用期间暂停内联 auto-save

### 7.5 与 aiChatStore 的集成

`aiChatStore.finalizeAssistant` 当前不处理 diff proposals。修改方案：

```typescript
// aiChatStore.ts 扩展
interface FinalizeData {
  // ... 现有字段
  diffProposals?: ParsedFileDiff[]  // 新增
}

// finalizeAssistant action 内:
if (data.diffProposals && data.diffProposals.length > 0) {
  // 直接设置到 message
  state.messages[idx].diffProposals = data.diffProposals
}
```

**替代方案（更解耦）：** 在 `WorkspaceStudioPage.onStreamEnd` 中：
1. 调用 `parseDiffBlocksWithFileRead(content, ...)` 
2. 得到 `ParsedFileDiff[]`
3. 直接通过 `aiChatStore.setState()` patch 到 message

选择替代方案——解析逻辑与 store 解耦，便于独立测试和替换。

---

## 八、分步实施计划

> 共 7 步，每步产出可独立验证的增量。Step 1-2 为类型 + 解析器基础，Step 3 为 store，Step 4-5 为 UI 组件，Step 6 为集成，Step 7 为测试。

### Step 1：类型系统扩展（预估 1h）

**产出：** `types.ts` 类型升级

**实施内容：**

1. 在 `src/renderer/components/studio/types.ts` 中：
   - 新增 `ParsedFileDiff` 接口（import `DiffHunk` from `git.types`）
   - `ChatMessage` 新增 `diffProposals?: ParsedFileDiff[]` 字段
   - 旧 `DiffProposal` 标记 `@deprecated`

2. 导出 `ParsedFileDiff` 供其他模块使用

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `ParsedFileDiff` 可被 store / parser / component 三处 import
- [ ] 旧 `DiffProposal` 引用处不报错（兼容保留）

### Step 2：Diff 解析器（预估 3h）

**产出：** `diffParser.ts` 完整解析器

**实施内容：**

1. 创建 `src/renderer/utils/diffParser.ts`：
   - `extractDiffCodeBlocks(content)` — 提取 `\`\`\`diff:路径` 代码块
   - `applyDiffBody(diffBody)` — 从 diff body 重建新文件内容
   - `isNewContentComplete(diffBody)` — 判断完整重写 vs 片段 diff
   - `applyPatchToContent(oldContent, diffBody)` — 片段 diff 应用到原文
   - `computeDiffHunks(oldContent, newContent)` — 使用 `diff` 库计算结构化 hunks
   - `parseDiffBlocksWithFileRead(content, currentFilePath, currentFileContent)` — 主入口 async 函数
   - `parseFallbackCodeBlock(content, currentFilePath, currentFileContent)` — Fallback 解析

2. 编写测试 `tests/renderer/diffParser.test.ts`：
   - 标准 `\`\`\`diff:路径` 格式解析
   - 多文件 diff 提取
   - 片段 diff 应用
   - 完整重写 diff 解析
   - 无 diff 代码块时 fallback
   - 空内容/格式异常容错
   - hunks 计算准确性

**验证标准：**
- [ ] 单元测试全部通过
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过

### Step 3：diffReviewStore（预估 1.5h）

**产出：** Diff 审查状态管理

**实施内容：**

1. 创建 `src/renderer/store/diffReviewStore.ts`：
   - `DiffReviewState` / `DiffReviewActions` 接口
   - `setProposals()` — 设置审查提案
   - `setActiveIndex()` — 切换多文件
   - `applyProposal()` — 应用单个提案（IPC write + 状态更新）
   - `applyAll()` — 批量应用
   - `startEditing()` / `cancelEditing()` / `updateEditingContent()` / `applyEdited()`
   - `dismiss()` — 关闭面板
   - `clearError()` — 清除错误
   - devtools 中间件
   - 导出 selectors

2. 编写测试 `tests/renderer/diffReviewStore.test.ts`

**验证标准：**
- [ ] Store 操作正确更新状态
- [ ] `applyProposal` 调用 `file:write` IPC
- [ ] 多文件 `applyAll` 逐个应用
- [ ] 编辑模式状态正确切换

### Step 4：DiffReviewPanel + DiffFileList（预估 3h）

**产出：** Diff 审查 UI 组件

**实施内容：**

1. 创建 `src/renderer/components/studio/DiffFileList.tsx`
   - 水平 tab 列表
   - 文件名 + 增删统计
   - 已应用状态显示

2. 创建 `src/renderer/components/studio/DiffReviewPanel.tsx`
   - 复用 `DiffHunkView`（from version-history）
   - 复用 `DiffFileList`
   - 操作按钮组（应用/编辑/取消/全部应用）
   - 错误提示 + 回滚选项
   - Loading 状态（isApplying）
   - 暗色/亮色模式

3. 创建 `src/renderer/components/studio/EditableDiffView.tsx`
   - Textarea 编辑视图
   - 等宽字体 + 行号
   - 内容变更回调

**验证标准：**
- [ ] 单文件 diff 预览正确渲染（增删高亮、行号）
- [ ] 多文件 tab 切换正确
- [ ] 已应用文件显示标记
- [ ] 暗色模式正确
- [ ] `npm run type-check` 通过

### Step 5：WorkspaceStudioPage + StudioAIPanel 集成（预估 3h）

**产出：** 完整链路贯通

**实施内容：**

1. 修改 `WorkspaceStudioPage.tsx`：
   - 重写 `onStreamEnd` 回调中的 diff 提取：`buildDiffProposal()` → `parseDiffBlocksWithFileRead()`
   - 将 `ParsedFileDiff[]` 设置到 aiChatStore message
   - 新增 `handleApplyDiff(messageId, filePath)` 回调
   - 新增 `handleApplyAll(messageId)` 回调
   - 新增 `handleEditDiff(messageId)` 回调
   - 新增 `handleDismissDiff()` 回调
   - 删除旧的 `applyDiffProposal()` / `buildDiffProposal()` / `applyProposalToContent()` 函数

2. 修改 `StudioAIPanel.tsx`：
   - 替换 `AIDiffPreviewCard` 为 `DiffReviewPanel`
   - 删除 `toDiffLines()` 函数
   - 更新 props 接口（onApplyDiffProposal → onApplyDiff 等）
   - 保留 `onApplyDiffProposal` prop 兼容旧接口

3. 修改 `aiChatStore.ts`：
   - 可选：在 `finalizeAssistant` 中新增 `diffProposals` 字段处理

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] AI 响应包含 `\`\`\`diff:路径` 时自动解析
- [ ] Diff 预览正确展示
- [ ] 点击"应用"写入文件
- [ ] AutoSaveManager 触发自动 commit
- [ ] 多文件修改显示列表
- [ ] 编辑模式可修改内容后应用

### Step 6：错误处理与回滚（预估 2h）

**产出：** 完整的错误处理链路

**实施内容：**

1. `diffReviewStore` 中完善错误处理：
   - `applyProposal` 捕获 `file:write` 错误
   - `applyAll` 中断机制（遇到错误停止）
   - `rollbackApplied` 回滚函数

2. `DiffReviewPanel` 中错误 UI：
   - 错误横幅（红色，显示文件名 + 错误信息）
   - "回滚已应用的修改" 按钮
   - 回滚中 loading 状态
   - 回滚成功/失败反馈

3. 解析器错误处理：
   - `file:read` 失败时 oldContent 为空字符串
   - diff 计算异常时返回空 hunks
   - 格式异常时跳过该 block

**验证标准：**
- [ ] 写入失败显示错误提示
- [ ] 回滚按钮可恢复已写入文件
- [ ] 解析异常不导致 UI 崩溃
- [ ] `npm run type-check` 通过

### Step 7：测试完善（预估 2h）

**产出：** 完整测试套件

**实施内容：**

1. `tests/renderer/diffParser.test.ts`（Step 2 已部分完成，补充边界场景）：
   - 嵌套代码块
   - 超长 diff（>1000 行）
   - 文件路径含特殊字符
   - CRLF/LF 混合行尾
   - Unicode 内容

2. `tests/renderer/DiffReviewPanel.test.tsx`：
   - 单文件 diff 渲染
   - 多文件 tab 切换
   - 应用按钮调用回调
   - 编辑模式切换
   - 错误状态显示
   - 暗色模式快照

3. `tests/renderer/diffReviewStore.test.ts`（Step 3 已部分完成，补充异步测试）：
   - `applyProposal` 成功/失败
   - `applyAll` 部分失败
   - 回滚逻辑

4. 更新现有测试确保无回归：
   - `StudioAIPanel.test.tsx` — 新 props 接口兼容
   - `WorkspaceStudioPage.test.tsx` — 回调签名变更

**验证标准：**
- [ ] 新增测试覆盖率 ≥ 60%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 现有测试全部通过（无回归）

---

## 九、验收标准与交付物

### 9.1 功能验收清单

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | AI 响应包含 `\`\`\`diff:路径` 代码块时自动识别为文件修改建议 | 任务 spec AC1 | Step 2, 5 | 让 AI 响应包含 diff 代码块 |
| 2 | Diff 预览展示增删行高亮 | 任务 spec AC2 | Step 4 | 观察 diff 预览颜色标记 |
| 3 | 用户点击"应用"后写入文件 | 任务 spec AC3 | Step 5 | 点击应用后检查文件内容 |
| 4 | 用户点击"编辑"后打开可编辑 diff 视图 | 任务 spec AC4 | Step 4, 5 | 点击编辑后 textarea 出现 |
| 5 | 写入文件后触发自动保存和 git commit | 任务 spec AC5 | Step 5 | 检查 `.sibylla` git log |
| 6 | AI 建议多个文件修改时显示列表 | 任务 spec AC6 | Step 4, 5 | 多文件 diff tab 切换 |
| 7 | 修改失败显示错误并回滚 | 任务 spec AC7 | Step 6 | 模拟写入失败 |
| 8 | 符合 CLAUDE.md 规范：展示 diff 预览，禁止静默写入 | CLAUDE.md | Step 4-6 | 代码审查 |

### 9.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | Diff 解析耗时 | < 200ms（< 500 行文件） | Console.time |
| 2 | Diff 预览渲染 | < 100ms | React DevTools Profiler |
| 3 | 多文件（>5 个）切换 | < 50ms | 手动验证 |
| 4 | 文件写入 | < 2s | 手动验证 |

### 9.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 新增代码测试覆盖率 ≥ 60% | Vitest 覆盖率 |
| 4 | 现有测试全部通过 | `npm run test` |
| 5 | 无 `any` 类型 | TypeScript strict check |

### 9.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/renderer/components/studio/types.ts` | 修改 | 新增 `ParsedFileDiff`，`ChatMessage` 扩展 |
| 2 | `src/renderer/utils/diffParser.ts` | 新增 | Diff 解析器 |
| 3 | `src/renderer/store/diffReviewStore.ts` | 新增 | Diff 审查 Zustand store |
| 4 | `src/renderer/components/studio/DiffReviewPanel.tsx` | 新增 | Diff 审查面板 |
| 5 | `src/renderer/components/studio/DiffFileList.tsx` | 新增 | 多文件列表 |
| 6 | `src/renderer/components/studio/EditableDiffView.tsx` | 新增 | 可编辑 diff 视图 |
| 7 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 重写 | diff 提取 + 应用链路 |
| 8 | `src/renderer/components/studio/StudioAIPanel.tsx` | 修改 | 替换 diff 预览组件 |
| 9 | `src/renderer/store/aiChatStore.ts` | 扩展 | diffProposals 支持 |
| 10 | `src/renderer/components/studio/AIDiffPreviewCard.tsx` | 废弃 | 由 DiffReviewPanel 替代 |
| 11 | `tests/renderer/diffParser.test.ts` | 新增 | 解析器测试 |
| 12 | `tests/renderer/DiffReviewPanel.test.tsx` | 新增 | 面板测试 |
| 13 | `tests/renderer/diffReviewStore.test.ts` | 新增 | Store 测试 |

---

## 十、风险评估与回滚策略

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| AI 输出的 diff 格式不规范（路径缺失、行前缀错误） | 高 | 高 | 解析器严格容错 + fallback 完整重写解析；不匹配则跳过 |
| `ChatMessage.diffProposal` 类型变更破坏现有代码 | 高 | 中 | 旧字段 `@deprecated` 保留，新字段 `diffProposals` 并行存在；渐进迁移 |
| 多文件写入部分失败导致文件状态不一致 | 高 | 中 | `appliedPaths` 追踪 + `fullOldContent` 回滚；中断机制 |
| `diff` 库 `structuredPatch` 对大文件性能差 | 中 | 低 | diff 预览限制最大行数（>500 行时折叠中间部分） |
| WorkspaceStudioPage 内联 auto-save 与 diff 应用写入冲突 | 中 | 中 | diff 应用期间暂停内联 auto-save debounce |
| DiffHunkView（TASK009）复用时的类型兼容问题 | 低 | 低 | 两者使用相同的 `DiffHunk`/`DiffLine` 类型（git.types），已验证一致 |

### 10.2 时间风险

本任务核心风险在于 Diff 解析器的鲁棒性（AI 输出不可控）和 WorkspaceStudioPage 集成改造的联动。建议按 Step 顺序严格推进，Step 2（解析器）充分测试后再进入 Step 5（集成）。

### 10.3 回滚策略

| 变更 | 回滚方式 |
|------|---------|
| `types.ts` 新增类型 | 删除新增接口即可，旧 `DiffProposal` 保留 |
| `diffParser.ts` | 独立新增文件，可安全删除 |
| `diffReviewStore.ts` | 独立新增文件，可安全删除 |
| `DiffReviewPanel/FileList/EditableDiffView` | 独立新增文件，可安全删除 |
| `WorkspaceStudioPage` 改造 | git revert 恢复 `buildDiffProposal` + `applyDiffProposal` |
| `StudioAIPanel` 改造 | git revert 恢复 `AIDiffPreviewCard` + `toDiffLines` |
| `aiChatStore` 扩展 | 删除 `diffProposals` 相关代码即可 |

**最小回滚方案：** 如果 diff 审查链路存在严重问题，可仅回滚 `WorkspaceStudioPage.tsx` + `StudioAIPanel.tsx` 两个文件，恢复旧 diff 提取逻辑。新增的类型、解析器、组件不影响旧逻辑。

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
**更新记录：**
- 2026-04-18 — 初始创建

