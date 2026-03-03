# Phase 1 Skills

> Sibylla 项目 Phase 1（核心功能）开发所需的 skills
> 状态：待创建
> 优先级：中高

---

## 概述

Phase 1 专注于 Sibylla 的核心功能实现，包括编辑器、本地存储、AI 集成和状态管理。

---

## 待创建 Skills 列表

### 1. [`tiptap-wysiwyg-editor`]

**功能**：Tiptap WYSIWYG 编辑器集成与扩展

**覆盖内容**：
- Tiptap v2 基础使用
- ProseMirror 底层扩展
- 自定义节点与标记
- 协作编辑集成
- Markdown 双向转换
- 编辑器性能优化

**参考文档**：
- [`architecture.md`](../../specs/design/architecture.md:96)
- [`ui-ux-design.md`](../../specs/design/ui-ux-design.md)

**互补关系**：与 [`frontend-design`](../.kilocode/skills/common/frontend-design/SKILL.md) 和 [`ui-ux-pro-max`](../.kilocode/skills/common/ui-ux-pro-max/SKILL.md) 互补，专注于编辑器实现

---

### 2. [`sqlite-local-storage`]

**功能**：SQLite 本地数据库设计与优化

**覆盖内容**：
- better-sqlite3 使用与配置
- 数据库 schema 设计
- 全文搜索索引（FTS5）
- 向量检索扩展（sqlite-vec）
- 事务管理与并发控制
- 性能优化（索引、查询优化）

**参考文档**：
- [`architecture.md`](../../specs/design/architecture.md:98)
- [`data-and-api.md`](../../specs/design/data-and-api.md:354-402)

**互补关系**：为本地数据存储提供基础

---

### 3. [`ai-context-engine`]

**功能**：AI 上下文引擎设计与实现

**覆盖内容**：
- 三层上下文模型（始终加载、语义相关、手动引用）
- Token 预算管理与裁剪策略
- 语义搜索集成（embedding、向量检索）
- 上下文组装算法
- MCP（Model Context Protocol）集成

**参考文档**：
- [`architecture.md`](../../specs/design/architecture.md:214-249)
- [`memory-system-design.md`](../../specs/design/memory-system-design.md)

**互补关系**：AI 上下文管理的核心逻辑

---

### 4. [`llm-streaming-integration`]

**功能**：LLM 流式响应集成与处理

**覆盖内容**：
- 流式 API 调用（Claude/GPT/Gemini/DeepSeek）
- Server-Sent Events (SSE) 处理
- 流式响应的 UI 渲染
- 错误处理与重试机制
- Token 计算与预算控制（tiktoken）

**参考文档**：
- [`architecture.md`](../../specs/design/architecture.md:119-126)
- [`data-and-api.md`](../../specs/design/data-and-api.md:281-302)

**互补关系**：与 [`ai-context-engine`] 互补，专注于 LLM 调用的技术细节

---

### 5. [`zustand-state-management`]

**功能**：Zustand 轻量状态管理

**覆盖内容**：
- Zustand store 设计模式
- TypeScript 类型安全集成
- 中间件使用（persist、devtools）
- 性能优化（selector、shallow）
- 与 React 集成最佳实践

**参考文档**：
- [`architecture.md`](../../specs/design/architecture.md:95)

**互补关系**：与 [`vercel-react-best-practices`](../.kilocode/skills/common/vercel-react-best-practices/SKILL.md) 互补，专注于 Zustand 的使用

---

## 创建顺序建议

按照依赖关系和优先级，建议按以下顺序创建：

1. **`zustand-state-management`** - 状态管理基础
2. **`sqlite-local-storage`** - 数据存储基础
3. **`tiptap-wysiwyg-editor`** - 编辑器核心
4. **`ai-context-engine`** - AI 上下文引擎
5. **`llm-streaming-integration`** - LLM 集成

---

## 创建指南

使用 [`skill-creator`](../.kilocode/skills/common/skill-creator/SKILL.md) skill 创建新 skills：

1. 理解 skill 的具体使用场景
2. 规划可复用的 skill 内容（scripts/references/assets）
3. 使用 `init_skill.py` 初始化 skill
4. 编辑 SKILL.md 和资源文件
5. 使用 `package_skill.py` 打包验证
6. 迭代优化

---

## 相关文档

- [`development-skills-inventory.md`](../../plans/development-skills-inventory.md) - 完整 skills 清单
- [`skills-folder-restructure.md`](../../plans/skills-folder-restructure.md) - 文件夹重构方案
- [`specs/requirements/phase1/README.md`](../../specs/requirements/phase1/README.md) - Phase 1 需求文档
