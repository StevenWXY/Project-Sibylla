# Hook 节点与 Reactive Compact 设计文档

> Sprint 3.5 — AI 能力扩展体系
> 版本: v1.0 | 最后更新: 2026-04-23

## 1. 概述

Hook 系统和 Reactive Compact 是 Sibylla AI 管道的两个关键横切关注点。Hook 系统提供可扩展的节点拦截机制，允许在 AI 处理管线的特定节点注入自定义逻辑。Reactive Compact 提供自动化的上下文压缩和错误恢复机制。

## 2. Hook 节点系统

### 2.1 架构

```
┌──────────────────────────────────────────────────┐
│                HookRegistry                        │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Priority  │ │ Disabled     │ │ Config       │ │
│  │ Sort      │ │ Persistence  │ │ Store        │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                HookExecutor                        │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Timeout   │ │ Block        │ │ Fail-Open    │ │
│  │ (5s)     │ │ Short-Circuit│ │ Fallback     │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                UserHookLoader                      │
│  ┌──────────────────────────────────────────┐     │
│  │ 加载用户自定义 Hook (使用 claude-3-haiku)  │     │
│  └──────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
```

### 2.2 执行规则

1. **Priority 降序**: 高 priority 的 Hook 先执行
2. **Block 短路**: 返回 `block` 决策时立即停止后续 Hook
3. **5s 超时**: 单个 Hook 超时 5 秒自动跳过（fail-open）
4. **异常 fail-open**: Hook 抛出异常时返回 `allow`
5. **条件跳过**: `condition` 表达式求值为 false 时跳过

### 2.3 用户 Hook

用户自定义 Hook 使用 `claude-3-haiku-20240307` 模型执行，限制：
- 超时: 5 秒
- 不可访问文件系统
- 仅返回 `allow` / `block` 决策

### 2.4 持久化

禁用状态通过 `configStore` 持久化，重启后保持。

### 2.5 内置 Hook

| Hook | 节点 | 功能 |
|------|------|------|
| guardrail-hook | 多节点 | 安全防护 |
| sensor-hook | 多节点 | 质量检测 |
| evaluator-hook | 多节点 | 输出评估 |
| guide-hook | 多节点 | 行为引导 |

## 3. Reactive Compact 系统

### 3.1 架构

```
┌──────────────────────────────────────────────────┐
│              CompactOrchestrator                   │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Trigger   │ │ Hook         │ │ Event        │ │
│  │ Identifier│ │ Integration  │ │ Push         │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│              ReactiveCompact                       │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Auto      │ │ Aggressive   │ │ Escalation   │ │
│  │ Compact   │ │ Truncate     │ │ Strategy     │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
└──────────────────────────────────────────────────┘
```

### 3.2 触发类型与恢复策略

| 触发类型 | 策略链 | 说明 |
|----------|--------|------|
| `prompt_too_long` (413) | auto_compact → aggressive_truncate | 先尝试智能压缩，失败则激进裁剪 |
| `max_output_tokens` | escalate_64k → inject_continue → max_retries | 逐步升级输出限制 |
| `media_size` | media_truncate | 截断大媒体内容 |

### 3.3 Aggressive Truncate 策略

保留内容：
1. System prompt
2. 第一条 user message（标记 `[任务锚点]`）
3. 最近 10 条消息

### 3.4 重试控制

- 最大重试次数: 3
- 超过后提示用户手动操作 (`clear` / `compact`)

### 3.5 Hook 集成

Compact 过程触发 Hook 节点：
- `PreCompaction`: 压缩前
- `PostCompaction`: 压缩后

### 3.6 Trace 集成

Compact 过程生成 `compact.boundary` span，包含：
- `triggerType`: 触发类型
- `tokensBefore` / `tokensAfter`: token 变化
- `recovered`: 是否成功恢复
- `strategy`: 使用的恢复策略

### 3.7 UI 事件推送

通过 IPC 推送到 renderer：
- `compact:started` — 开始压缩
- `compact:completed` — 压缩完成
- `compact:failed` — 压缩失败

每个事件包含 `boundaryMessage` 字段，记录 compact_boundary 显式消息。

## 4. 管道集成

Hook 和 Compact 在 AI 管道中的位置：

```
用户输入 → [Hook: PreProcess] → Context Assembly → AI 调用
                                                    ↓
                                              [可能触发 Compact]
                                                    ↓
AI 响应 → [Hook: PostProcess] → [Hook: OutputCheck] → 用户
```
