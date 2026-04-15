# AI 对话流式响应集成

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK011 |
| **任务标题** | AI 对话流式响应集成 |
| **所属阶段** | Phase 1 - AI 系统 MVP (Sprint 3) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

将现有的 AI 对话系统从"请求-响应"模式升级为真正的流式响应，实现 SSE 流式 API → 主进程 IPC event push → 渲染进程增量渲染的完整链路。

### 背景

代码库已有以下基础：
- `ai-gateway-client.ts`（82 行）— HTTP 客户端，当前仅支持完整响应
- `ai.handler.ts`（222 行）— IPC handler，`stream()` 方法实际返回完整响应而非流式 chunk
- `StudioAIPanel.tsx`（250 行）— 前端 AI 对话 UI，有 streaming 状态渲染框架
- `WorkspaceStudioPage.tsx`（1350 行）— 集成层，AI 对话状态管理

核心缺口：`ai.handler.ts` 的 `stream()` 没有实现真正的 SSE 流式推送，返回的是完整响应。需要实现完整的流式链路。

### 范围

**包含：**
- AI Gateway Client SSE 流式解析
- 主进程 IPC event push（`ai:stream:chunk`、`ai:stream:end`、`ai:stream:error`）
- 渲染进程增量渲染
- 流式中断（用户取消）
- 错误恢复（网络中断、超时）
- 与现有 `MemoryManager` 日志记录集成

**不包含：**
- 上下文引擎（TASK012）
- Diff 审查（TASK013）
- 多会话管理
- AI 模型选择 UI

## 技术要求

### 架构设计

```
渲染进程                         主进程                          云端
StudioAIPanel                    AIHandler                      AI Gateway
    │                              │                              │
    │── ai:stream(request) ──────▶│                              │
    │                              │── POST /ai/chat (stream) ──▶│
    │                              │◀── SSE chunk ──────────────│
    │◀── ai:stream:chunk ─────────│                              │
    │◀── ai:stream:chunk ─────────│◀── SSE chunk ──────────────│
    │◀── ai:stream:end ───────────│◀── SSE done ───────────────│
    │                              │── log to MemoryManager ───▶│
```

### 核心类型扩展

```typescript
// src/shared/types.ts 扩展

export interface AIStreamChunk {
  id: string
  delta: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface AIStreamEnd {
  id: string
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  ragHits: AIRagHit[]
  memory: AIMemoryState
}

// IPC_CHANNELS 新增
AI_STREAM_CHUNK: 'ai:stream:chunk'
AI_STREAM_END: 'ai:stream:end'
AI_STREAM_ERROR: 'ai:stream:error'
AI_STREAM_ABORT: 'ai:stream:abort'
```

### 实现细节

#### 1. AiGatewayClient 流式支持

```typescript
// src/main/services/ai-gateway-client.ts 扩展
async *chatStream(
  request: AiGatewayChatRequest,
  accessToken?: string
): AsyncGenerator<string, void, undefined> {
  const response = await fetch(`${this.baseUrl}/api/v1/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ...request, stream: true }),
  })

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  while (reader) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') return
        yield data
      }
    }
  }
}
```

#### 2. AIHandler 流式推送

```typescript
// ai.handler.ts stream() 方法重写
private async stream(
  event: IpcMainInvokeEvent,
  input: AIChatRequest | string
): Promise<AIChatResponse> {
  const request = this.normalizeRequest(input)
  const sender = event.sender

  // ... 上下文组装（复用现有逻辑）

  const fullContent: string[] = []
  const stream = this.gatewayClient.chatStream(gatewayRequest, accessToken)

  for await (const chunk of stream) {
    fullContent.push(chunk)
    sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, {
      id: sessionId,
      delta: chunk,
    })
  }

  const finalContent = fullContent.join('')
  sender.send(IPC_CHANNELS.AI_STREAM_END, {
    id: sessionId,
    content: finalContent,
    ragHits: ragHits.map(h => ({ path: h.path, score: h.score, snippet: h.snippet })),
    memory: { ... },
  })

  // 日志记录 + memory flush（复用现有逻辑）
}
```

#### 3. 渲染进程增量渲染

`WorkspaceStudioPage.tsx` 监听 IPC stream events，更新 `ChatMessage.streaming` 状态。

## 验收标准

- [ ] AI 对话支持流式输出，逐字/逐句渲染
- [ ] 流式输出过程中有明确视觉反馈（打字光标）
- [ ] 用户可中断流式输出（Stop 按钮）
- [ ] 网络中断时显示错误提示，保留已输出内容
- [ ] 流式完成后自动记录到 Daily Log
- [ ] 流式完成后触发 memory flush 检查
- [ ] 暗色/亮色模式均正常显示

## 依赖关系

### 前置依赖

- [x] AIHandler IPC 基础框架
- [x] StudioAIPanel UI 组件
- [x] MemoryManager 日志记录

### 被依赖任务

- TASK012（上下文引擎）— 需流式对话基础
- TASK013（Diff 审查）— 需流式响应中解析 diff 标记
- TASK016（记忆联调）— 需日志记录接口

## 参考文档

- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — 需求 2.2、2.3
- `src/main/ipc/handlers/ai.handler.ts` — 现有 AI IPC Handler
- `src/main/services/ai-gateway-client.ts` — 现有 Gateway Client
- `src/renderer/components/studio/StudioAIPanel.tsx` — 现有 AI 面板 UI

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
