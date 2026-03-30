# Phase 1 Skills

> Sibylla 项目 Phase 1（核心功能）开发所需的 skills
> 状态：已完成
> 优先级：中高

---

## 概述

Phase 1 专注于 Sibylla 的核心功能实现，包括编辑器、本地存储、AI 集成和状态管理。

---

## Skills 列表

### 1. [`tiptap-wysiwyg-editor`](tiptap-wysiwyg-editor/SKILL.md)

Tiptap v2 富文本编辑器集成与扩展最佳实践，涵盖 React 集成、ProseMirror 扩展开发、Markdown 双向转换、自定义节点与标记、斜杠命令、工具栏构建、编辑器与 Electron IPC 集成、性能优化等核心内容。

### 2. [`sqlite-local-storage`](sqlite-local-storage/SKILL.md)

基于 better-sqlite3 的本地数据库设计与优化最佳实践，涵盖数据库 schema 设计、全文搜索索引（FTS5）、向量检索扩展（sqlite-vec）、事务管理与并发控制、数据库 migration、性能优化、IPC 集成等核心内容。

### 3. [`ai-context-engine`](ai-context-engine/SKILL.md)

AI 上下文引擎设计与实现最佳实践，涵盖三层上下文模型（始终加载、语义相关、手动引用）、Token 预算管理与裁剪策略、语义搜索集成（embedding + 向量检索 + RRF 融合）、上下文组装算法、MCP（Model Context Protocol）集成、记忆系统交互等核心内容。

### 4. [`llm-streaming-integration`](llm-streaming-integration/SKILL.md)

LLM 流式响应集成与处理最佳实践，涵盖多模型流式 API 调用（Claude/GPT/Gemini/DeepSeek）、统一适配器模式、Server-Sent Events (SSE) 处理、Electron IPC 流式传输、React 流式渲染、错误处理与重试机制、Token 计算与预算控制（tiktoken）等核心内容。

### 5. [`zustand-state-management`](zustand-state-management/SKILL.md)

Zustand 轻量状态管理最佳实践，涵盖 store 设计模式、TypeScript 类型安全集成（严格模式零 any）、中间件使用（persist、devtools、immer）、性能优化（selector、useShallow）、模块化 store 拆分、与 Electron IPC 集成、异步操作状态管理等核心内容。

---

## 开发状态

**Phase 1 进度**：5/5 已完成 ✅

| Skill | 状态 |
|-------|------|
| `tiptap-wysiwyg-editor` | ✅ 已完成 |
| `sqlite-local-storage` | ✅ 已完成 |
| `ai-context-engine` | ✅ 已完成 |
| `llm-streaming-integration` | ✅ 已完成 |
| `zustand-state-management` | ✅ 已完成 |

---

## 技能协同

这些 skills 形成完整的 Phase 1 核心功能技术栈：
- **编辑器**：`tiptap-wysiwyg-editor` 提供富文本编辑能力
- **本地存储**：`sqlite-local-storage` 提供本地数据库设计指导
- **AI 上下文**：`ai-context-engine` 负责上下文组装与检索
- **LLM 集成**：`llm-streaming-integration` 处理流式 AI 调用
- **状态管理**：`zustand-state-management` 管理渲染进程应用状态

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
