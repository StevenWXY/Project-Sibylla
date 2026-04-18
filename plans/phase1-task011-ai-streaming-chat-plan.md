# PHASE1-TASK011: AI 对话流式响应集成 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task011_ai-streaming-chat.md](../specs/tasks/phase1/phase1-task011_ai-streaming-chat.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK011 |
| **任务标题** | AI 对话流式响应集成 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ AIHandler IPC 基础框架、✅ StudioAIPanel UI 组件、✅ MemoryManager 日志记录 |

### 目标

将现有的 AI 对话系统从"请求-响应"模式升级为真正的流式响应，实现 SSE 流式 API → 主进程 IPC event push → 渲染进程增量渲染的完整链路。

### 核心命题

当前 `ai.handler.ts` 的 `stream()` 方法名不副实——它通过 `handleChatLikeRequest(input, true)` 走的仍是完整响应路径，`AiGatewayClient.chat()` 返回的是一次性 `AiGatewayChatResponse`，渲染进程通过 `safeInvoke` 一次性拿到完整内容。用户需要等待 AI 完整生成后才能看到任何输出，体验割裂。

本任务要在不破坏现有 `ai:chat`（非流式）和 `ai:embed` 通道的前提下，将 `ai:stream` 改造为真正的 SSE 流式推送链路。

### 范围边界

**包含：**
- `AiGatewayClient` 新增 `chatStream()` AsyncGenerator 方法（SSE 解析）
- `ai.handler.ts` 的 `stream()` 重写为 IPC event push 模式
- `src/shared/types.ts` 新增流式 IPC 通道 + 类型定义
- `preload/index.ts` 新增流式 IPC bridge（`ai.onStreamChunk` / `onStreamEnd` / `onStreamError`）
- `WorkspaceStudioPage.tsx` 重写 `sendChatMessage` 消费流式事件
- `StudioAIPanel.tsx` 增量渲染 + 打字光标 + Stop 按钮
- 流式中断（用户取消 → `ai:stream:abort`）
- 错误恢复（网络中断保留已输出内容）
- 与现有 `MemoryManager` 日志记录集成（流式完成后 flush）
- Mock API / 测试 setup 扩展

**不包含：**
- 上下文引擎 v1（TASK012）
- Diff 审查（TASK013）
- 多会话管理
- AI 模型选择 UI
- 云端 AI Gateway 服务端改造（假设已支持 SSE `stream: true`）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；所有异步操作必须有错误处理；关键操作结构化日志 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统/API Key；IPC 通信严格隔离；AI 网关仅运行在主进程 |
| 数据模型与 API | `specs/design/data-and-api.md` | IPC 通信模式：invoke/handle + send/on；IPCChannelMap 类型映射 |
| 需求规格 | `specs/requirements/phase1/sprint3-ai-mvp.md` | 需求 2.2（AI 主对话窗口实时流式响应）、需求 2.3（AI 模型网关 SSE 转发） |
| 任务规格 | `specs/tasks/phase1/phase1-task011_ai-streaming-chat.md` | 架构图、核心类型扩展、实现细节模板 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | AI 对话窗口交互规范、loading 状态、暗色/亮色模式 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `llm-streaming-integration` | `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` | SSE 流式解析、AsyncGenerator 模式、React 流式渲染 Hook、错误分类与重试、Token 计算 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `send/on` 流式推送模式、主进程 `webContents.send` 推送到渲染进程、Preload bridge 设计、流式数据生命周期管理 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | AI 聊天状态 store 设计（可选：若将 ChatMessage 状态迁移到 Zustand）、selector 精确订阅 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 流式类型严格约束、AsyncGenerator 类型、IPC 通道类型扩展 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 流式渲染性能优化、`useCallback` 稳定引用、避免不必要的重渲染 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | 82 | ⚠️ 需扩展 | 当前仅支持 `chat()` 完整响应；需新增 `chatStream()` AsyncGenerator |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` | 222 | ⚠️ 需重写 | `stream()` 调用 `handleChatLikeRequest` 走非流式路径；需改为 IPC event push 模式 |
| IPC_CHANNELS | `src/shared/types.ts:72-186` | 973 | ⚠️ 需扩展 | 缺少 `AI_STREAM_CHUNK` / `AI_STREAM_END` / `AI_STREAM_ERROR` / `AI_STREAM_ABORT` 通道 |
| AIChatRequest / AIChatResponse | `src/shared/types.ts:570-616` | — | ⚠️ 需扩展 | 缺少 `AIStreamChunk` / `AIStreamEnd` / `AIStreamError` 类型 |
| IPCChannelMap | `src/shared/types.ts:228-323` | — | ⚠️ 需扩展 | `AI_STREAM` 当前映射为 invoke/handle，需改为 send/on 或独立事件通道 |
| Preload ai API | `src/preload/index.ts:576-589` | 664 | ⚠️ 需扩展 | `ai.stream()` 当前走 `safeInvoke`；需新增 `onStreamChunk` / `onStreamEnd` / `onStreamError` 事件监听 |
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | 250 | ✅ 有框架 | 已有 `isStreaming` prop 和 streaming 渲染骨架；需改为增量内容渲染 |
| WorkspaceStudioPage sendChatMessage | `src/renderer/pages/WorkspaceStudioPage.tsx:809-938` | 1334 | ⚠️ 需重写 | 当前一次性 `await ai.stream(request)` 获取完整响应；需改为事件驱动增量更新 |
| ChatMessage 类型 | `src/renderer/components/studio/types.ts:37-45` | 51 | ✅ 已完成 | 已有 `streaming` 字段；`content` 可增量更新 |
| MemoryManager | `src/main/services/memory-manager.ts` | — | ✅ 已完成 | `appendLog` / `flushIfNeeded` 可直接复用 |
| IpcHandler 基类 | `src/main/ipc/handler.ts` | 221 | ⚠️ 需注意 | `safeHandle` 强制返回 `IPCResponse<T>` 包装；流式推送需绕过此包装，直接使用 `event.sender.send` |
| LocalRagEngine | `src/main/services/local-rag-engine.ts` | — | ✅ 已完成 | `search()` 可直接复用 |
| TokenStorage | `src/main/services/token-storage.ts` | — | ✅ 已完成 | `getAccessToken()` 可直接复用 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK012（上下文引擎 v1） | 需流式对话基础链路，在此基础上注入上下文 |
| PHASE1-TASK013（Diff 审查） | 需流式响应中解析 diff 标记，从 `AIStreamChunk` 中增量提取 |
| PHASE1-TASK016（记忆联调） | 需 `AIStreamEnd` 中的 `memory` 字段触发 flush |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `zustand` ^5.0.11 — 状态管理（ChatMessage 状态）
- `lucide-react` ^0.577.0 — 图标（Send, Loader2, Square/StopCircle）
- `clsx` + `tailwind-merge` — 样式工具
- `@testing-library/react` + `vitest` — 测试框架

**不引入 `eventsource-parser` 或 `@microsoft/fetch-event-source`。** SSE 解析使用原生 `fetch` + `ReadableStream` + `TextDecoder`，与 skill 推荐模式一致。

---

## 三、现有代码盘点与差距分析

### 3.1 当前 AI 请求完整数据流

```
渲染进程 WorkspaceStudioPage     主进程 AIHandler              云端 AI Gateway
    │                              │                              │
    │ safeInvoke('ai:stream',req)  │                              │
    │─────────────────────────────▶│                              │
    │                              │ gatewayClient.chat(req)      │
    │                              │─────────────────────────────▶│
    │                              │◀──── 完整 JSON 响应 ─────────│
    │◀── IPCResponse<AIChatResponse>│                              │
    │  (一次性返回完整 content)     │                              │
```

**问题：** 用户发送消息后需要等待 5-30 秒才能看到任何 AI 输出。在此期间仅显示骨架屏动画（`animate-pulse`），无法感知进度。

### 3.2 目标流式数据流

```
渲染进程 WorkspaceStudioPage     主进程 AIHandler              云端 AI Gateway
    │                              │                              │
    │ ipcRenderer.send('ai:stream')│                              │
    │─────────────────────────────▶│                              │
    │                              │ chatStream(req)  SSE         │
    │                              │─────────────────────────────▶│
    │◀── ai:stream:chunk ─────────│◀── SSE "data: ..." ─────────│
    │◀── ai:stream:chunk ─────────│◀── SSE "data: ..." ─────────│
    │◀── ai:stream:chunk ─────────│◀── SSE "data: ..." ─────────│
    │◀── ai:stream:end ───────────│◀── SSE "data: [DONE]" ──────│
    │                              │ memoryManager.flushIfNeeded  │
```

### 3.3 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| Gateway SSE 流式调用 | ❌ `chat()` 仅支持完整响应 | 无 `chatStream()` | `AiGatewayClient.chatStream()` AsyncGenerator |
| 主进程流式 IPC 推送 | ❌ `safeHandle` 强制 `IPCResponse<T>` 包装 | 无 event push 能力 | `ai.handler.ts` 重写为 `ipcMain.on` + `event.sender.send` |
| 流式 IPC 通道定义 | ❌ 仅有 `AI_STREAM: 'ai:stream'` | 缺 chunk/end/error/abort | 4 个新通道常量 + 类型 |
| Preload 流式 bridge | ❌ `ai.stream()` 走 `safeInvoke` | 无事件监听 API | `onStreamChunk` / `onStreamEnd` / `onStreamError` |
| 渲染进程增量消费 | ❌ 一次性 `setMessages` | 无增量更新逻辑 | 事件驱动的 `setMessages` 增量更新 |
| 流式中断（用户取消） | ⚠️ 仅有 `activeAIRequestRef` 跳过结果 | 无真正中止请求 | `ai:stream:abort` + AbortController |
| 流式错误保留已输出内容 | ❌ 出错后整体替换为错误消息 | 需追加错误到已有内容后 | 保留 `accumulatedContent` |
| 打字光标视觉反馈 | ⚠️ 有 `animate-pulse` 骨架屏 | 需改为内联闪烁光标 | `▍` 光标 + `animate-pulse` |

### 3.4 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/renderer/hooks/useAIStream.ts` | 新增 | AI 流式对话 Hook（封装 IPC 事件监听 + 状态管理） |
| 2 | `src/renderer/store/aiChatStore.ts` | 新增 | AI 聊天状态 Zustand store（messages + streaming 状态） |
| 3 | `tests/renderer/useAIStream.test.ts` | 新增 | 流式 Hook 测试 |
| 4 | `tests/renderer/aiChatStore.test.ts` | 新增 | Store 测试 |
| 5 | `tests/main/AiGatewayClient.test.ts` | 新增 | chatStream AsyncGenerator 测试 |
| 6 | `tests/main/AIHandler.stream.test.ts` | 新增 | 流式 IPC 推送测试 |

### 3.5 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/main/services/ai-gateway-client.ts` | 新增 `chatStream()` AsyncGenerator 方法 | 低 — 纯新增方法，不改动现有 `chat()` |
| 2 | `src/main/ipc/handlers/ai.handler.ts` | 重写 `stream()` 为 `ipcMain.on` + event push；保留 `chat()` 不变 | 高 — 核心变更 |
| 3 | `src/shared/types.ts` | 新增 4 个 IPC 通道 + 3 个流式类型 | 低 — 纯扩展 |
| 4 | `src/preload/index.ts` | 新增流式事件监听 API；`ai.stream()` 改为触发式 | 中 — preload 变更 |
| 5 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 重写 `sendChatMessage` 消费流式事件 | 高 — 核心变更 |
| 6 | `src/renderer/components/studio/StudioAIPanel.tsx` | 增量渲染 + 打字光标 + Stop 按钮完善 | 中 — UI 变更 |
| 7 | `src/renderer/dev/mockElectronAPI.ts` | 新增流式 mock API | 低 — 开发辅助 |
| 8 | `tests/renderer/setup.ts` | 新增流式 mock | 低 — 测试辅助 |

### 3.6 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/main/services/memory-manager.ts` | 已有 `appendLog` / `flushIfNeeded`，流式完成后直接复用 |
| `src/main/services/local-rag-engine.ts` | `search()` 在流式开始前调用，与流式无关 |
| `src/main/services/token-storage.ts` | `getAccessToken()` 直接复用 |
| `src/renderer/components/studio/types.ts` | `ChatMessage` 类型已满足流式需求（`streaming` + `content` 增量更新） |
| `src/renderer/components/studio/AIDiffPreviewCard.tsx` | Diff 预览卡片不受流式影响，从最终内容中提取 |

---

## 四、类型系统设计

### 4.1 新增 IPC 通道（`src/shared/types.ts`）

```typescript
// 在 IPC_CHANNELS 对象中新增（AI 操作区块内）
AI_STREAM_CHUNK: 'ai:stream:chunk',
AI_STREAM_END: 'ai:stream:end',
AI_STREAM_ERROR: 'ai:stream:error',
AI_STREAM_ABORT: 'ai:stream:abort',
```

### 4.2 新增流式类型（`src/shared/types.ts`）

```typescript
export interface AIStreamChunk {
  id: string
  delta: string
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
  provider: 'openai' | 'anthropic' | 'mock'
  model: string
  intercepted: boolean
  warnings: string[]
}

export interface AIStreamError {
  id: string
  code: 'rate_limit' | 'context_length' | 'timeout' | 'auth' | 'network' | 'unknown'
  message: string
  retryable: boolean
  partialContent: string
}
```

### 4.3 新增流式请求类型

```typescript
export interface AIStreamRequest extends AIChatRequest {
  /** Unique stream session ID for correlating chunk/end/error events */
  streamId: string
}
```

### 4.4 IPCChannelMap 扩展

```typescript
// 流式通道使用 send/on 模式，不映射到 IPCChannelMap 的 invoke/handle 模式
// AI_STREAM 保留为触发通道（渲染→主进程 send）
// AI_STREAM_CHUNK / END / ERROR / ABORT 为推送通道（主进程→渲染进程 send）
```

**设计决策：** 流式通道采用 `send/on` 模式而非 `invoke/handle`，原因：
1. `invoke/handle` 强制返回单次 `IPCResponse<T>`，无法实现多次推送
2. `send/on` 允许主进程逐块推送 chunk，渲染进程通过事件监听增量消费
3. `AI_STREAM` 通道从 `ipcMain.handle` 改为 `ipcMain.on`（触发式，无返回值）

### 4.5 设计决策说明

**`AIStreamEnd` 包含完整 `content`：**
- 流式完成后需要完整内容用于 Diff 提案提取、memory flush、token 统计
- 避免渲染进程自行拼接 chunk 可能的遗漏

**`AIStreamError` 包含 `partialContent`：**
- 网络中断时保留已输出的内容，用户不丢失已完成的部分
- UI 显示：已输出内容 + 错误提示横幅

**`streamId` 贯穿请求链路：**
- 每次流式请求生成唯一 `streamId`
- chunk/end/error 事件都携带 `streamId`，渲染进程据此关联到正确的 assistant message
- 防止多窗口并发请求导致事件混乱

---

## 五、AiGatewayClient 流式支持

### 5.1 设计原则

1. **不改动现有 `chat()` 方法** — `ai:chat` 非流式通道保持不变
2. **新增 `chatStream()` AsyncGenerator** — yield SSE chunk 的 text content
3. **原生 fetch + ReadableStream** — 不引入第三方 SSE 库
4. **AbortController 支持** — 接收外部 `AbortSignal` 实现用户取消

### 5.2 chatStream() 实现

```typescript
// src/main/services/ai-gateway-client.ts 新增方法
async *chatStream(
  request: AiGatewayChatRequest,
  accessToken?: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, undefined>
```

**SSE 解析策略（参考 `llm-streaming-integration` skill §1）：**
- `fetch` 发送 `{ ...request, stream: true }`，携带 `signal`
- `response.body.getReader()` + `TextDecoder` 流式读取
- **buffer 累积**：TCP 分片可能导致一行 SSE 跨多个 `read()` 到达，`lines.pop()` 保留未完成行
- **JSON 优先 + raw text fallback**：先解析 `choices[0].delta.content`（OpenAI 兼容），失败则直接 yield
- `data: [DONE]` 结束流；`finally` 中 `reader.releaseLock()`

### 5.3 错误处理

| 场景 | 处理方式 |
|------|---------|
| `response.ok === false` | throw Error → AIHandler 捕获 → `ai:stream:error` |
| `response.body === null` | throw Error → 同上 |
| `signal.aborted`（用户取消） | `reader.read()` 抛出 AbortError → AIHandler 静默结束 |
| 网络中断 | throw → AIHandler → `ai:stream:error` + `partialContent` |
| SSE 行格式异常 | 跳过非 `data:` 行 |

---

## 六、AIHandler 流式推送重写

### 6.1 设计原则

1. **`chat()` 和 `embed()` 保持不变** — 继续使用 `safeHandle` + `ipcMain.handle`
2. **`stream()` 从 `ipcMain.handle` 改为 `ipcMain.on`** — 触发式，通过 `event.sender.send` 逐块推送
3. **复用现有上下文组装** — RAG / memory snapshot / system prompt（从 `handleChatLikeRequest` 提取）
4. **AbortController 集成** — `activeStreams: Map<streamId, AbortController>`

**为什么不用 `safeHandle`：** `safeHandle` 强制返回 `IPCResponse<T>` 单次包装，无法实现多次推送。流式推送需绕过此包装，错误改为手动发送 `ai:stream:error`。

### 6.2 register() 改造

```typescript
register(): void {
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, this.safeHandle(this.chat.bind(this)))
  ipcMain.handle(IPC_CHANNELS.AI_EMBED, this.safeHandle(this.embed.bind(this)))
  ipcMain.on(IPC_CHANNELS.AI_STREAM, this.handleStream.bind(this))
  ipcMain.on(IPC_CHANNELS.AI_STREAM_ABORT, this.handleStreamAbort.bind(this))
}
```

### 6.3 handleStream() 核心流程

```
1. extractStreamId(input) → normalizeRequest(input) → sender = event.sender
2. 创建 AbortController → activeStreams.set(streamId, controller)
3. ensureWorkspaceServices() → RAG 查询 → memory snapshot → systemSegments 构建
4. gatewayClient.chatStream(gatewayRequest, accessToken, abortController.signal)
5. for await (chunk of stream):
     fullContent.push(chunk)
     sender.send(AI_STREAM_CHUNK, { id: streamId, delta: chunk })
6. sender.send(AI_STREAM_END, { id, content: fullContent.join(''), usage, ragHits, memory, ... })
7. memoryManager.appendLog() + flushIfNeeded()
8. catch: abort → 静默; 其他 → sender.send(AI_STREAM_ERROR, { id, code, message, partialContent })
9. finally: activeStreams.delete(streamId)
```

**关键检查：** 每次 `sender.send` 前检查 `!sender.isDestroyed()`，防止窗口关闭后发送。

### 6.4 中断处理

```typescript
private handleStreamAbort(_event: IpcMainInvokeEvent, streamId: string): void {
  const controller = this.activeStreams.get(streamId)
  if (controller) { controller.abort(); this.activeStreams.delete(streamId) }
}
```

### 6.5 cleanup() 改造

```typescript
override cleanup(): void {
  ipcMain.removeHandler(IPC_CHANNELS.AI_CHAT)
  ipcMain.removeHandler(IPC_CHANNELS.AI_EMBED)
  ipcMain.removeAllListeners(IPC_CHANNELS.AI_STREAM)
  ipcMain.removeAllListeners(IPC_CHANNELS.AI_STREAM_ABORT)
  for (const [, controller] of this.activeStreams) controller.abort()
  this.activeStreams.clear()
}
```

### 6.6 辅助方法

- **`classifyStreamError(error)`**：按 message 匹配返回 `'rate_limit' | 'context_length' | 'timeout' | 'auth' | 'network' | 'unknown'`
- **`isRetryable(error)`**：`rate_limit` / `timeout` / `network` 为 retryable
- **`estimateUsage(system, user, output)`**：CJK 按每 2 字符 1 token、其余按每 4 字符 1 token 近似估算（SSE 流式通常不返回 usage）

> **后续优化：** 若云端 SSE 最后事件返回实际 usage，替换估算值。

---

## 七、Preload Bridge 流式扩展

### 7.1 ai 命名空间改造

**Before → After 签名变化：**

```typescript
// Before: stream 返回 Promise<IPCResponse<AIChatResponse>>
stream: (request) => Promise<IPCResponse<AIChatResponse>>

// After: stream 返回 streamId（触发式）
stream: (request) => string
abortStream: (streamId: string) => void                // 新增
onStreamChunk: (cb) => () => void                       // 新增
onStreamEnd: (cb) => () => void                         // 新增
onStreamError: (cb) => () => void                       // 新增
```

### 7.2 实现要点

`stream()` 内部：
1. 生成 `streamId = stream-${Date.now()}-${random}`
2. 将 streamId 注入 payload：`{ ...request, streamId }`
3. `ipcRenderer.send(IPC_CHANNELS.AI_STREAM, payload)` — 触发式，不等待
4. 返回 streamId

`onStreamChunk/End/Error`：封装 `api.on(channel, callback)`，返回 unlisten 函数。

`abortStream`：`ipcRenderer.send(IPC_CHANNELS.AI_STREAM_ABORT, streamId)`。

### 7.3 ElectronAPI 类型更新

`preload/index.ts` 的 `ElectronAPI` interface 新增上述 4 个方法签名。import 新增 `AIStreamChunk`, `AIStreamEnd`, `AIStreamError` 类型。

### 7.4 事件通道白名单

新增的 4 个通道（`ai:stream:chunk/end/error/abort`）已在 `IPC_CHANNELS` 常量中定义，自动通过 `isChannelAllowed()` 白名单。

---

## 八、渲染进程流式消费

### 8.1 aiChatStore 设计

将 AI 对话的 `messages` / `isStreaming` / `activeStreamId` 状态从 `WorkspaceStudioPage` 的 `useState` 迁移到 Zustand store。

```typescript
// src/renderer/store/aiChatStore.ts
interface AIChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeStreamId: string | null
  sessionTokenUsage: number
}

interface AIChatActions {
  addUserMessage: (content: string) => string
  addAssistantPlaceholder: (id: string, contextSources?: string[]) => void
  appendToAssistant: (streamId: string, delta: string) => void
  finalizeAssistant: (streamId: string, data: FinalizeData) => void
  markAssistantError: (streamId: string, errorMessage: string) => void
  stopStreaming: (streamId: string) => void
  setStreaming: (streamId: string | null) => void
  reset: () => void
}
```

**设计决策：**
- `activeStreamId` 关联 `AIStreamChunk.id` → `ChatMessage.id`，确保 chunk 推送到正确的 message
- `appendToAssistant` 仅更新 `content` 字段（增量追加），不触发其他字段变更
- devtools 中间件集成；导出 selectors 供各组件精确订阅

### 8.2 useAIStream Hook

```typescript
// src/renderer/hooks/useAIStream.ts
export function useAIStream(options?: UseAIStreamOptions) {
  // useEffect: 注册 onStreamChunk / onStreamEnd / onStreamError，cleanup 时 unlisten
  // startStream(request): 调 window.electronAPI.ai.stream(request) → 返回 streamId
  // abortStream(streamId): 调 window.electronAPI.ai.abortStream(streamId)
  return { startStream, abortStream }
}
```

**事件消费流程：**
- `onStreamChunk` → `appendToAssistant(chunk.id, chunk.delta)` — 增量追加 content
- `onStreamEnd` → `finalizeAssistant(end.id, { content, ragHits, usage, ... })` — 设置 streaming=false + 完整内容
- `onStreamError` → `markAssistantError(error.id, error.message)` — 保留已有内容 + 错误信息

### 8.3 WorkspaceStudioPage sendChatMessage 重写

**核心变化：从 `await ai.stream(request)` → `startStream(request)` 事件驱动**

```
Before: await window.electronAPI.ai.stream(request) → 一次性拿完整 AIChatResponse
After:  startStream(request) → 返回 streamId → chunk/end/error 由 useAIStream 全局监听器消费
```

具体改造：
1. `addUserMessage(trimmed)` + `addAssistantPlaceholder(assistantId, initialSources)` — 通过 store 添加消息
2. `startStream(request)` — 触发流式，返回 streamId
3. `onStreamEnd` 回调中执行 `buildDiffProposal`、`sessionTokenUsage` 累加、notification 推送
4. `onStreamError` 回调中推送 error notification
5. `stopStreaming` 改为 `abortStream(streamId)`
6. 删除 `isStreaming` / `messages` useState（从 store selector 获取）

### 8.4 StudioAIPanel 增量渲染改造

**改造要点（最小化变更）：**

1. **删除独立骨架屏块** — streaming 消息直接渲染 `content`（初始为空，随 chunk 增量填充）
2. **打字光标** — `message.streaming && message.content` 时显示白色闪烁竖线：
   ```tsx
   {message.streaming && message.content && (
     <span className="inline-block w-1.5 h-4 ml-0.5 bg-white/80 animate-pulse rounded-sm" />
   )}
   ```
3. **Diff / Apply / Context sources 延迟渲染** — 仅在 `!message.streaming` 后渲染，避免中间态闪烁
4. **Stop 按钮** — streaming 时发送按钮变为 `<Square className="h-3.5 w-3.5 fill-current" />`，点击触发 `abortStream`

---

## 九、Mock API 与测试扩展

### 9.1 mockElectronAPI.ts 扩展

`stream()` mock：使用 `setInterval` 每 50ms 逐字推送中文模拟文本，通过 `window.dispatchEvent(CustomEvent)` 触发。`onStreamChunk/End` 使用 `window.addEventListener` 消费。`onStreamError` 暂返回空 unlisten。`abortStream` 清除 interval。

### 9.2 测试 setup 扩展

```typescript
// tests/renderer/setup.ts
mockElectronAPI.ai = {
  ...mockElectronAPI.ai,
  stream: vi.fn().mockReturnValue('mock-stream-id'),
  abortStream: vi.fn(),
  onStreamChunk: vi.fn().mockReturnValue(vi.fn()),
  onStreamEnd: vi.fn().mockReturnValue(vi.fn()),
  onStreamError: vi.fn().mockReturnValue(vi.fn()),
}
```

---

## 十、分步实施计划

> 共 7 步，每步产出可独立验证的增量。Step 1-2 为类型 + 主进程基础设施，Step 3 为 Preload bridge，Step 4-5 为渲染进程消费，Step 6 为集成改造，Step 7 为测试。

### Step 1：类型系统扩展（预估 1h）

**产出：** `src/shared/types.ts` 新增流式类型 + IPC 通道

**实施内容：**

1. 在 `IPC_CHANNELS` 中新增 4 个通道：
   - `AI_STREAM_CHUNK: 'ai:stream:chunk'`
   - `AI_STREAM_END: 'ai:stream:end'`
   - `AI_STREAM_ERROR: 'ai:stream:error'`
   - `AI_STREAM_ABORT: 'ai:stream:abort'`

2. 新增类型接口：
   - `AIStreamChunk`（id + delta）
   - `AIStreamEnd`（id + content + usage + ragHits + memory + provider + model + intercepted + warnings）
   - `AIStreamError`（id + code + message + retryable + partialContent）
   - `AIStreamRequest extends AIChatRequest`（新增 streamId）

3. 在 `IPCChannelMap` 中添加注释说明流式通道不适用 invoke/handle 模式

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] 新增类型可被 main / preload / renderer 三端 import

### Step 2：AiGatewayClient.chatStream() + AIHandler 重写（预估 3h）

**产出：** 主进程流式链路完整实现

**实施内容：**

1. `src/main/services/ai-gateway-client.ts` 新增 `chatStream()` AsyncGenerator
   - SSE 解析（buffer 累积 + 逐行提取）
   - AbortSignal 支持
   - JSON 解析 + raw text fallback
   - reader 释放（finally）

2. `src/main/ipc/handlers/ai.handler.ts` 重写：
   - `register()`: `AI_STREAM` 改为 `ipcMain.on`，新增 `AI_STREAM_ABORT` 监听
   - `handleStream()`: 上下文组装 → chatStream → 逐块 sender.send → end 事件 → memory flush
   - `handleStreamAbort()`: AbortController.abort()
   - 新增 `activeStreams` Map 管理活跃流
   - 新增 `classifyStreamError()` / `isRetryable()` / `estimateUsage()` 辅助方法
   - `cleanup()`: removeAllListeners + 中断所有活跃流

3. 保持 `chat()` / `embed()` 不变

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] 非流式 `ai:chat` 和 `ai:embed` 仍正常工作

### Step 3：Preload Bridge 流式扩展（预估 1.5h）

**产出：** Preload 暴露流式 API

**实施内容：**

1. `src/preload/index.ts` ai 命名空间改造：
   - `stream()`: 从 `safeInvoke` 改为 `ipcRenderer.send`，返回 streamId
   - 新增 `abortStream(streamId)`
   - 新增 `onStreamChunk(callback)` → `api.on('ai:stream:chunk', ...)`
   - 新增 `onStreamEnd(callback)` → `api.on('ai:stream:end', ...)`
   - 新增 `onStreamError(callback)` → `api.on('ai:stream:error', ...)`

2. `ElectronAPI` interface 类型更新

3. import 新增类型：`AIStreamChunk`, `AIStreamEnd`, `AIStreamError`

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] Preload 编译无错误

### Step 4：aiChatStore + useAIStream Hook（预估 2h）

**产出：** 渲染进程流式状态管理

**实施内容：**

1. 创建 `src/renderer/store/aiChatStore.ts`：
   - State: messages / isStreaming / activeStreamId / sessionTokenUsage
   - Actions: addUserMessage / addAssistantPlaceholder / appendToAssistant / finalizeAssistant / markAssistantError / stopStreaming / setStreaming / reset
   - devtools 中间件
   - 导出 selectors

2. 创建 `src/renderer/hooks/useAIStream.ts`：
   - useEffect 注册 onStreamChunk / onStreamEnd / onStreamError
   - cleanup 时 unlisten 所有监听
   - 返回 startStream / abortStream

3. 扩展 `src/renderer/dev/mockElectronAPI.ts` 流式 mock

4. 扩展 `tests/renderer/setup.ts` 流式 mock

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] DevTools 可查看 AIChatStore 状态
- [ ] Mock 模式下 chunk 事件正确更新 store

### Step 5：StudioAIPanel 增量渲染改造（预估 1.5h）

**产出：** UI 流式渲染效果

**实施内容：**

1. 修改 `src/renderer/components/studio/StudioAIPanel.tsx`：
   - 删除独立骨架屏块（`isStreaming && messages.length > 0` 区块）
   - assistant 消息内：streaming 时显示打字光标 `▍`
   - Diff 预览 / Apply 按钮：仅在 `!message.streaming` 后渲染
   - Context sources：仅在 `!message.streaming` 后渲染
   - 发送按钮：streaming 时显示 Stop 方块图标

2. 新增 `Square` 图标 import（from lucide-react）

**验证标准：**
- [ ] 流式中显示打字光标
- [ ] 流式结束后光标消失，Diff / Apply 按钮出现
- [ ] Stop 按钮可中断流式
- [ ] 暗色模式正确显示

### Step 6：WorkspaceStudioPage 集成改造（预估 2h）

**产出：** 完整流式链路贯通

**实施内容：**

1. 修改 `src/renderer/pages/WorkspaceStudioPage.tsx`：
   - 引入 `useAIChatStore` 和 `useAIStream`
   - 重写 `sendChatMessage`：从 `await ai.stream(request)` 改为 `startStream(request)` 事件驱动
   - `onStreamEnd` 回调：执行 `buildDiffProposal`、`sessionTokenUsage` 累加、notification 推送
   - `onStreamError` 回调：error notification 推送
   - `stopStreaming` 改为 `abortStream(streamId)`
   - 删除 `isStreaming` / `messages` useState（迁移到 store）
   - 从 store 获取 messages / isStreaming（selector 订阅）

2. 确保所有依赖 `messages` 的逻辑（applyDiffProposal、notification 等）从 store 获取

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] 发送消息后逐字渲染 AI 响应
- [ ] Stop 按钮可中断
- [ ] 流式完成后 Diff 预览正确显示
- [ ] Memory flush notification 正常触发
- [ ] Token 统计正常累加

### Step 7：测试编写（预估 2h）

**产出：** 完整测试套件

**实施内容：**

1. 创建 `tests/main/AiGatewayClient.test.ts`：
   - `chatStream()` 正常流式输出（多个 chunk + 结束）
   - SSE buffer 跨分片正确解析
   - AbortSignal 中断
   - HTTP 错误（非 200）抛出异常
   - `response.body === null` 抛出异常

2. 创建 `tests/main/AIHandler.stream.test.ts`：
   - `handleStream` 正确发送 chunk → end 事件序列
   - RAG 查询在流式开始前完成
   - Memory flush 在流式完成后触发
   - Abort 中断后不发送 error 事件
   - `sender.isDestroyed()` 检查

3. 创建 `tests/renderer/aiChatStore.test.ts`：
   - `appendToAssistant` 增量追加 content
   - `finalizeAssistant` 设置 streaming=false + 完整内容
   - `markAssistantError` 保留已有内容 + 追加错误
   - `stopStreaming` 中止流式

4. 创建 `tests/renderer/useAIStream.test.ts`：
   - chunk 事件触发 store 更新
   - end 事件触发 finalize + callback
   - error 事件触发 error 处理
   - cleanup 时 unlisten 所有监听

**验证标准：**
- [ ] 新增测试覆盖率 ≥ 60%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 现有测试全部通过（无回归）

---

## 十一、验收标准与交付物

### 11.1 功能验收清单

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | AI 对话支持流式输出，逐字渲染 | 任务 spec 验收标准 1 | Step 2-6 | 发送消息观察逐字渲染 |
| 2 | 流式输出过程中有打字光标视觉反馈 | 验收标准 2 | Step 5 | 观察白色闪烁竖线 |
| 3 | 用户可中断流式输出（Stop 按钮） | 验收标准 3 | Step 3-6 | 点击 Stop 按钮中断 |
| 4 | 网络中断时显示错误提示，保留已输出内容 | 验收标准 4 | Step 2,6 | 模拟断网验证 |
| 5 | 流式完成后自动记录到 Daily Log | 验收标准 5 | Step 2 | 检查 `.sibylla/memory/daily/` 日志 |
| 6 | 流式完成后触发 memory flush 检查 | 验收标准 6 | Step 2 | 观察 flush notification |
| 7 | 暗色/亮色模式均正常显示 | 验收标准 7 | Step 5 | 切换主题验证 |
| 8 | 非流式 `ai:chat` 和 `ai:embed` 不受影响 | 范围边界 | Step 2 | 功能回归测试 |

### 11.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 首个 chunk 延迟 | < 2s（TTFT） | 手动计时 |
| 2 | chunk 到 UI 渲染延迟 | < 50ms | React DevTools Profiler |
| 3 | 内存占用稳定（长输出） | 无持续增长 | Chrome DevTools Memory |
| 4 | IPC 事件不导致非相关组件重渲染 | 仅 AI 面板重渲染 | Zustand selector 验证 |

### 11.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 新增代码测试覆盖率 ≥ 60% | Vitest 覆盖率 |
| 4 | 现有测试全部通过 | `npm run test` |
| 5 | 无 `any` 类型 | TypeScript strict check |

### 11.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/shared/types.ts` | 扩展 | 新增 4 通道 + 4 类型 |
| 2 | `src/main/services/ai-gateway-client.ts` | 扩展 | 新增 `chatStream()` |
| 3 | `src/main/ipc/handlers/ai.handler.ts` | 重写 | stream 改为 event push |
| 4 | `src/preload/index.ts` | 扩展 | 新增流式 bridge API |
| 5 | `src/renderer/store/aiChatStore.ts` | 新增 | AI 聊天 Zustand store |
| 6 | `src/renderer/hooks/useAIStream.ts` | 新增 | 流式 Hook |
| 7 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 重写 | sendChatMessage 事件驱动 |
| 8 | `src/renderer/components/studio/StudioAIPanel.tsx` | 改造 | 增量渲染 + 光标 + Stop |
| 9 | `src/renderer/dev/mockElectronAPI.ts` | 扩展 | 流式 mock API |
| 10 | `tests/renderer/setup.ts` | 扩展 | 流式 mock |
| 11 | `tests/main/AiGatewayClient.test.ts` | 新增 | chatStream 测试 |
| 12 | `tests/main/AIHandler.stream.test.ts` | 新增 | 流式 IPC 测试 |
| 13 | `tests/renderer/aiChatStore.test.ts` | 新增 | Store 测试 |
| 14 | `tests/renderer/useAIStream.test.ts` | 新增 | Hook 测试 |

---

## 十二、风险评估与回滚策略

### 12.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 云端 AI Gateway 未实现 SSE stream 模式 | 高 | 中 | chatStream() 内部检测 response.content-type，若非 text/event-stream 则 fallback 到完整响应并拆分为单个 chunk |
| `ipcMain.on` 改造破坏现有 `ai:stream` 调用方 | 高 | 低 | workspaceStudioPage 是唯一调用方，同步改造；其他代码不直接调用 `ai:stream` |
| Preload 接口签名变更（`stream` 返回值从 Promise 变为 string）| 中 | 中 | WorkspaceStudioPage 同步改造；全局搜索 `ai.stream` 确保无遗漏调用方 |
| 多窗口并发流式请求导致事件混乱 | 中 | 低 | `streamId` 贯穿请求链路；`activeStreams` Map 隔离不同流 |
| SSE 分片解析丢 chunk | 中 | 低 | buffer 累积策略 + 单元测试覆盖跨分片场景 |
| `sender.isDestroyed()` 检查遗漏 | 低 | 中 | 每次.sender.send 前检查；单元测试 mock destroyed 场景 |
| `aiChatStore` 迁移导致状态丢失 | 高 | 低 | 逐组件迁移：先保留 useState 作为 fallback，store 验证通过后再删除 |

### 12.2 时间风险

本任务复杂度高，核心风险在于 AIHandler 重写和 WorkspaceStudioPage 集成改造的联动。建议按 Step 顺序严格推进，每个 Step 完成后验证再进入下一步。

### 12.3 回滚策略

| 变更 | 回滚方式 |
|------|---------|
| `src/shared/types.ts` 新增通道和类型 | 删除新增行即可，无破坏性 |
| `AiGatewayClient.chatStream()` | 纯新增方法，删除即可 |
| `ai.handler.ts` stream 重写 | git revert 恢复 `safeHandle` + `handleChatLikeRequest` 模式 |
| Preload ai 流式 API | git revert 恢复 `safeInvoke` 模式 |
| `aiChatStore` + `useAIStream` | 独立新增文件，可安全删除 |
| `WorkspaceStudioPage` 改造 | git revert 恢复 `await ai.stream()` 模式 |
| `StudioAIPanel` 改造 | git revert 恢复骨架屏模式 |

**最小回滚方案：** 如果流式链路存在严重问题，可仅回滚 `ai.handler.ts` + `preload/index.ts` + `WorkspaceStudioPage.tsx` 三个文件，恢复到非流式模式。新增的类型和 `chatStream()` 方法不影响非流式链路。

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建
---
