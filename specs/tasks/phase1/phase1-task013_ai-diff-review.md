# AI 文件修改 Diff 审查

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK013 |
| **任务标题** | AI 文件修改 Diff 审查 |
| **所属阶段** | Phase 1 - AI 系统 MVP (Sprint 3) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 已完成 |

## 任务描述

### 目标

实现 AI 建议修改文件时的完整链路：AI 响应中解析 diff 标记 → 展示 diff 预览 → 用户确认 → 写入文件 → 触发自动保存和提交。

### 背景

代码库已有 `AIDiffPreviewCard.tsx` 组件（基本 UI），`WorkspaceStudioPage.tsx` 中有 `DiffProposal` 类型和 `onApplyDiffProposal` / `onEditAndApplyDiffProposal` 回调框架。但缺：
- AI 响应中 diff 块的解析（从 Markdown 代码块提取）
- Diff 预览的增强（行级 diff、语法高亮）
- 用户确认后写入文件的完整链路
- 多文件修改的处理

### 范围

**包含：**
- AI 响应中 diff 标记解析器
- Diff 预览 UI 增强（行级增删标记）
- 用户确认流程（应用/编辑/取消）
- 写入文件 + 触发自动保存
- 多文件修改列表
- 修改失败回滚

**不包含：**
- 实时协同 diff（CRDT）
- 复杂的三方合并

## 核心类型

```typescript
// AI 响应中的 diff 标记格式
// ```diff:path/to/file.md
// - 旧内容
// + 新内容
// ```

export interface ParsedFileDiff {
  filePath: string
  hunks: DiffHunk[]
  fullNewContent: string
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  changes: DiffChange[]
}

export interface DiffChange {
  type: 'add' | 'remove' | 'context'
  content: string
  lineNumber: number
}
```

## 验收标准

- [x] AI 响应包含 ````diff:路径` 代码块时自动识别为文件修改建议
- [x] Diff 预览展示增删行高亮
- [x] 用户点击"应用"后写入文件
- [x] 用户点击"编辑"后打开可编辑 diff 视图
- [x] 写入文件后触发自动保存和 git commit
- [x] AI 建议多个文件修改时显示列表
- [x] 修改失败显示错误并回滚
- [x] 符合 CLAUDE.md 规范："AI 输出涉及文件修改时，必须展示 diff 预览，禁止静默写入"

## 依赖关系

### 前置依赖

- [ ] TASK011（AI 流式响应）— 需要完整的 AI 响应才能解析 diff

### 被依赖任务

- 无直接依赖

## 参考文档

- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — 需求 2.4
- [`CLAUDE.md`](../../../CLAUDE.md) — UI/UX 红线："必须展示 diff 预览，禁止静默写入"
- `src/renderer/components/studio/AIDiffPreviewCard.tsx` — 现有 Diff 预览组件

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-18
