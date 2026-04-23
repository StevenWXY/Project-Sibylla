# Prompt Library & PromptComposer 设计文档

> Sprint 3.5 — AI 能力扩展体系
> 版本: v1.0 | 最后更新: 2026-04-23

## 1. 概述

Prompt Library 是 Sibylla 的 Prompt 管理基础设施，负责 Prompt 片段的存储、发现、版本管理和组合。PromptComposer 在此基础上实现声明式的 Prompt 组合引擎，支持依赖校验、冲突检测、不可变段落和 token 预算控制。

## 2. 架构设计

### 2.1 核心组件

```
┌──────────────────────────────────────────────────┐
│                  PromptComposer                    │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Cache     │ │ Dependency   │ │ Conflict     │ │
│  │ (SHA256)  │ │ Checker      │ │ Detector     │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                  PromptLoader                     │
│  ┌──────────────┐ ┌──────────────────────────┐   │
│  │ User Override│ │ Builtin                  │   │
│  │ Priority     │ │ Fallback                 │   │
│  └──────────────┘ └──────────────────────────┘   │
├──────────────────────────────────────────────────┤
│                  PromptRegistry                   │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Index    │ │ Validation   │ │ Override     │ │
│  │ (YAML)   │ │ Engine       │ │ Manager      │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
└──────────────────────────────────────────────────┘
```

### 2.2 文件布局

```
resources/prompts/
├── index.yaml                    # Prompt 注册索引
├── core/
│   ├── identity.md              # AI 身份 (immutable)
│   ├── principles.md            # 行为原则 (immutable)
│   └── tone.md                  # 语气风格 (immutable)
├── modes/
│   ├── write.md                 # 写作模式
│   ├── review.md                # 审阅模式
│   ├── analyze.md               # 分析模式
│   ├── plan.md                  # 规划模式
│   └── free.md                  # 自由模式
├── tools/
│   └── {tool-id}.md             # 工具说明
├── agents/
│   └── {agent-id}.md            # Agent Prompt
└── contexts/
    ├── workspace-context.md     # 工作区上下文模板
    ├── user-profile.md          # 用户偏好模板
    └── time-context.md          # 时间上下文模板
```

用户覆盖路径: `.sibylla/prompts/`

## 3. Prompt 文件格式

```yaml
---
id: core.identity
version: "1.0.0"
scope: core
tags: [identity, core]
requires: []
conflicts: []
model_hint: null
estimated_tokens: 150
---

你是 Sibylla，一个智能协作助手。
```

## 4. 核心行为

### 4.1 不可变段落 (Immutable Segments)

Core 三片段 (identity/principles/tone) 不可被用户覆盖移除。用户覆盖文件中若包含 `<immutable>` 标签，则合并时保留原始不可变内容。

### 4.2 依赖校验

`requires` 字段声明前置依赖。若依赖不满足，抛出 `PromptDependencyError`。

### 4.3 冲突检测

`conflicts` 字段声明互斥关系。检测到冲突时仅写入 warning，不阻止组合。

### 4.4 Token 预算

超过 `maxTokens` 预算时仅 warning，不裁剪。

### 4.5 缓存

基于 SHA256 signature + 5s TTL 的内存缓存。

## 5. IPC 通道

| 通道 | 功能 |
|------|------|
| `prompt-library:list-all` | 列出所有已注册 Prompt |
| `prompt-library:read` | 读取 Prompt 内容 |
| `prompt-library:derive-user-copy` | 派生用户副本 |
| `prompt-library:reset-user-override` | 重置用户覆盖 |
| `prompt-library:validate` | 验证 Prompt 格式 |
| `prompt-library:estimate-tokens` | 估算 token 数 |

## 6. 错误类型

| 类型 | 类 | 行为 |
|------|---|------|
| 格式错误 | `PromptFormatError` | 返回路径+行号+错误类型 |
| 依赖缺失 | `PromptDependencyError` | 抛出异常，阻止组合 |

## 7. 性能指标

- 缓存命中延迟: < 100ms
- 完整组合延迟: < 500ms
- Frontmatter 解析: < 10ms
