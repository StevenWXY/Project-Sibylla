# Sub-agent 系统设计文档

> Sprint 3.5 — AI 能力扩展体系
> 版本: v1.0 | 最后更新: 2026-04-23

## 1. 概述

Sub-agent 系统允许主 agent 生成独立的 AI 子代理执行特定任务。每个 Sub-agent 拥有独立的对话上下文、工具集、token 预算和生命周期管理，支持结构化输出、嵌套深度控制和优雅退出。

## 2. 架构设计

```
┌──────────────────────────────────────────────────┐
│                SubAgentExecutor                    │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Concurrency│ │ Execution   │ │ Graceful     │ │
│  │ Queue     │ │ Loop        │ │ Abort        │ │
│  │ (max 3)  │ │              │ │ (5s timeout) │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                SubAgentContext                     │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Generator │ │ Guardrail   │ │ Tool         │ │
│  │ Instance  │ │ Engine      │ │ Intersection │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                SubAgentRegistry                    │
│  ┌──────────────┐ ┌──────────────────────────┐   │
│  │ Builtin Scan │ │ Workspace Scan           │   │
│  └──────────────┘ └──────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## 3. Agent 定义格式

```markdown
---
id: code-analyzer
version: "1.0.0"
name: 代码分析器
description: 分析代码质量和潜在问题
model: claude-sonnet-4-20250514
allowed_tools:
  - readFile
  - searchFiles
max_turns: 10
max_tokens: 30000
context:
  inherit_memory: true
  inherit_trace: true
  inherit_workspace_boundary: true
output_schema:
  type: object
  required: ["summary", "issues"]
---

# 代码分析器

你是一个专业的代码分析器...
```

## 4. 核心行为

### 4.1 独立上下文

每个 Sub-agent 创建时生成：
- 独立的 `Generator` 实例
- 独立的 `GuardrailEngine`
- 独立的 `messages` 数组
- 独立的 `AbortController`

### 4.2 inherit_memory 控制

- `inherit_memory: true` → 加载 `MEMORY.md` 到 system context
- `inherit_memory: false` → 不加载任何记忆上下文

### 4.3 工具权限交集

Sub-agent 声明的工具集必须与父 agent 工具集取交集。不在交集中的工具被移除并记录 warning。

### 4.4 嵌套深度

最大嵌套深度: 3 层。`spawnSubAgent` 工具在深度达到上限时自动移除。

### 4.5 并发控制

最大并发数: 3。超出排入 FIFO 队列。

### 4.6 个人空间保护

Sub-agent 执行时检查 `workspaceBoundary`，拒绝跨个人空间访问。

## 5. 生命周期

```
create → run → [loop: generate → check] → extract output → result
                                              ↑
                                        retry (max 2)
```

### 5.1 中止机制

- 父 agent abort → 所有活跃 Sub-agent 收到 abort 信号
- 5 秒超时强制退出
- `gracefulAbort()` 确保资源清理

### 5.2 结构化输出

若定义 `output_schema`，从最终 assistant 消息中提取 JSON，校验 required 字段。失败最多重试 2 次。

## 6. Trace 集成

- 每个 Sub-agent run 创建嵌套 span，携带 `parent_trace_id`
- span 属性包含 agent.id, agent.version, parent info
- 每轮对话记录 turn event

## 7. IPC 通道

| 通道 | 功能 |
|------|------|
| `sub-agent:list` | 列出所有 Agent |
| `sub-agent:spawn` | 生成 Sub-agent |
| `sub-agent:create-from-template` | 从模板创建 |
