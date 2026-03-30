---
name: llm-streaming-integration
description: >-
  LLM 流式响应集成与处理最佳实践。当需要实现多模型流式 API 调用（Claude/GPT/Gemini/DeepSeek）、处理 Server-Sent Events (SSE) 流式响应、在 Electron IPC 中传输流式数据、实现流式响应的 React UI 渲染、设计错误处理与重试机制、或进行 Token 计算与预算控制时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - llm
    - streaming
    - sse
    - ai-gateway
    - electron
    - typescript
---

# LLM 流式响应集成

此 skill 提供 LLM 流式响应集成与处理的最佳实践指南，涵盖多模型流式 API 调用、SSE 处理、Electron IPC 流式传输、React 流式渲染、错误处理与重试、Token 计算等核心主题。与 [`ai-context-engine`](../ai-context-engine/SKILL.md) 互补，本 skill 专注于 LLM 调用的技术细节。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 集成多模型流式 API（Claude、GPT、Gemini、DeepSeek）
- 处理 Server-Sent Events (SSE) 流式响应
- 在 Electron 主进程与渲染进程之间传输 AI 流式数据
- 实现流式响应的 React UI 实时渲染
- 设计 AI 调用的错误处理、重试与超时机制
- 使用 tiktoken 进行 Token 计算与预算控制
- 实现 AI 对话的会话管理与历史维护

## 核心概念

### 1. AI 网关架构

AI 网关（AIGateway）运行在 Electron 主进程中，统一代理多个 LLM 提供商的 API 调用：

```
┌─────────────────────────────────────────────────┐
│              渲染进程 (React UI)                   │
│  ┌──────────────┐                                │
│  │   ChatPanel   │ ← 流式渲染 AI 响应              │
│  └──────┬───────┘                                │
│         │ ipc:ai:chat                            │
└─────────┼───────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────┐
│              主进程 (Node.js)                      │
│                                                   │
│  ContextEngine.assemble()                         │
│        │                                          │
│        ▼                                          │
│  ┌──────────────────────────────────────────┐    │
│  │           AIGateway (统一网关)              │    │
│  │  ┌─────────┐ ┌─────────┐ ┌───────────┐  │    │
│  │  │ Claude   │ │ GPT     │ │ Gemini    │  │    │
│  │  │ Adapter  │ │ Adapter │ │ Adapter   │  │    │
│  │  └─────────┘ └─────────┘ └───────────┘  │    │
│  │  ┌─────────┐                             │    │
│  │  │DeepSeek │                              │    │
│  │  │ Adapter │                              │    │
│  │  └─────────┘                             │    │
│  └──────────────────────────────────────────┘    │
│         │ SSE / streaming                         │
│         ▼                                         │
│  ipc:ai:stream → 渲染进程                          │
└───────────────────────────────────────────────────┘
```

**关键原则**：
- AI 网关仅运行在主进程中（安全隔离，API Key 不暴露给渲染进程）
- 统一适配器模式，屏蔽不同 LLM 提供商的 API 差异
- 流式数据通过 IPC 逐块传输到渲染进程
- 所有 AI 调用必须有完整的错误处理和超时机制

### 2. 统一网关接口设计

```typescript
// types/ai.ts

/** Chat request sent from renderer to main process */
interface ChatRequest {
  /** Unique session identifier */
  sessionId: string;
  /** Target model identifier */
  model: string;
  /** AI interaction mode */
  mode: 'chat' | 'plan' | 'review' | 'summary';
  /** Message history */
  messages: ChatMessage[];
  /** Assembled context (from ContextEngine) */
  context: AssembledContext;
  /** Optional generation parameters */
  options?: GenerationOptions;
}

/** Individual chat message */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Generation parameters */
interface GenerationOptions {
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Top-p sampling */
  topP?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/** Streaming chunk sent from main to renderer */
interface StreamChunk {
  /** Chunk type */
  type: 'content' | 'usage' | 'error' | 'done';
  /** Text content delta */
  content?: string;
  /** Token usage information (sent with 'usage' or 'done' type) */
  usage?: TokenUsage;
  /** Error information (sent with 'error' type) */
  error?: StreamError;
}

/** Token usage report */
interface TokenUsage {
  /** Tokens in the prompt */
  promptTokens: number;
  /** Tokens generated so far */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
}

/** Stream error information */
interface StreamError {
  /** Error code for programmatic handling */
  code: 'rate_limit' | 'context_length' | 'timeout' | 'auth' | 'unknown';
  /** Human-readable error message */
  message: string;
  /** Whether this error is retryable */
  retryable: boolean;
}
```

### 3. AI 网关实现

```typescript
// services/AIGateway.ts

import { EventEmitter } from 'events';

/** Model adapter interface — each LLM provider implements this */
interface ModelAdapter {
  /** Create a streaming chat completion */
  createStream(
    messages: ChatMessage[],
    options: GenerationOptions
  ): AsyncIterable<StreamChunk>;

  /** Check if the adapter supports a given model */
  supportsModel(modelId: string): boolean;
}

class AIGateway {
  private readonly adapters: ModelAdapter[];
  private readonly retryConfig: RetryConfig;

  constructor(adapters: ModelAdapter[], retryConfig?: RetryConfig) {
    this.adapters = adapters;
    this.retryConfig = retryConfig ?? {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      retryableErrors: ['rate_limit', 'timeout'],
    };
  }

  /**
   * Send a chat request and return an async iterable of stream chunks.
   * The caller (IPC handler) iterates over this and forwards to the renderer.
   */
  async *chat(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const adapter = this.findAdapter(request.model);

    // Build final messages from context + user messages
    const messages = this.buildMessages(request);

    let attempt = 0;
    while (attempt <= this.retryConfig.maxRetries) {
      try {
        const stream = adapter.createStream(
          messages,
          request.options ?? {}
        );

        for await (const chunk of stream) {
          yield chunk;

          // Stop on terminal chunks
          if (chunk.type === 'done' || chunk.type === 'error') {
            return;
          }
        }

        // Stream completed normally
        return;
      } catch (error) {
        attempt++;
        const streamError = this.classifyError(error);

        if (
          !streamError.retryable ||
          attempt > this.retryConfig.maxRetries
        ) {
          yield { type: 'error', error: streamError };
          return;
        }

        // Exponential backoff with jitter
        const delay = this.calculateBackoff(attempt);
        console.warn(
          `AI request failed (attempt ${attempt}/${this.retryConfig.maxRetries}), ` +
            `retrying in ${delay}ms: ${streamError.message}`
        );
        await this.sleep(delay);
      }
    }
  }

  private findAdapter(modelId: string): ModelAdapter {
    const adapter = this.adapters.find((a) => a.supportsModel(modelId));
    if (!adapter) {
      throw new Error(`No adapter found for model: ${modelId}`);
    }
    return adapter;
  }

  private buildMessages(request: ChatRequest): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // System message from assembled context
    if (request.context.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.context.systemPrompt,
      });
    }

    // Append context segments as system context
    const contextText = request.context.segments
      .filter((s) => s.layer !== 'always_load') // already in systemPrompt
      .map((s) => `--- ${s.source} ---\n${s.content}`)
      .join('\n\n');

    if (contextText) {
      messages.push({
        role: 'system',
        content: `[Project Context]\n\n${contextText}`,
      });
    }

    // User conversation messages
    messages.push(...request.messages);

    return messages;
  }

  private classifyError(error: unknown): StreamError {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();

      if (msg.includes('rate limit') || msg.includes('429')) {
        return {
          code: 'rate_limit',
          message: 'API 请求频率超限，请稍后重试',
          retryable: true,
        };
      }

      if (
        msg.includes('context length') ||
        msg.includes('token') ||
        msg.includes('too long')
      ) {
        return {
          code: 'context_length',
          message: '上下文长度超出模型限制',
          retryable: false,
        };
      }

      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        return {
          code: 'timeout',
          message: 'AI 请求超时',
          retryable: true,
        };
      }

      if (
        msg.includes('auth') ||
        msg.includes('401') ||
        msg.includes('api key')
      ) {
        return {
          code: 'auth',
          message: 'API Key 无效或已过期',
          retryable: false,
        };
      }
    }

    return {
      code: 'unknown',
      message: `未知错误: ${String(error)}`,
      retryable: false,
    };
  }

  private calculateBackoff(attempt: number): number {
    const { baseDelayMs, maxDelayMs } = this.retryConfig;
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * baseDelayMs;
    return Math.min(exponentialDelay + jitter, maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: StreamError['code'][];
}
```

### 4. Claude 适配器示例

```typescript
// services/adapters/ClaudeAdapter.ts

import Anthropic from '@anthropic-ai/sdk';

class ClaudeAdapter implements ModelAdapter {
  private readonly client: Anthropic;
  private readonly supportedModels = [
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
  ];

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  supportsModel(modelId: string): boolean {
    return this.supportedModels.some((m) => modelId.startsWith(m));
  }

  async *createStream(
    messages: ChatMessage[],
    options: GenerationOptions
  ): AsyncGenerator<StreamChunk> {
    // Separate system message (Claude API uses a dedicated system param)
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const systemPrompt = systemMessages
      .map((m) => m.content)
      .join('\n\n');

    const stream = this.client.messages.stream({
      model: this.resolveModelId(messages[0]?.content ?? ''),
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      system: systemPrompt || undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield {
          type: 'content',
          content: event.delta.text,
        };
      }
    }

    // Get final usage from the completed message
    const finalMessage = await stream.finalMessage();
    yield {
      type: 'usage',
      usage: {
        promptTokens: finalMessage.usage.input_tokens,
        completionTokens: finalMessage.usage.output_tokens,
        totalTokens:
          finalMessage.usage.input_tokens +
          finalMessage.usage.output_tokens,
      },
    };

    yield { type: 'done' };
  }

  private resolveModelId(context: string): string {
    // Map simplified model names to actual API model IDs
    return 'claude-3-opus-20240229';
  }
}
```

### 5. OpenAI 兼容适配器

适用于 GPT、DeepSeek 等 OpenAI 兼容 API：

```typescript
// services/adapters/OpenAICompatibleAdapter.ts

import OpenAI from 'openai';

interface OpenAIAdapterConfig {
  apiKey: string;
  baseURL?: string;
  supportedModels: string[];
  defaultModel: string;
}

class OpenAICompatibleAdapter implements ModelAdapter {
  private readonly client: OpenAI;
  private readonly config: OpenAIAdapterConfig;

  constructor(config: OpenAIAdapterConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  supportsModel(modelId: string): boolean {
    return this.config.supportedModels.some((m) => modelId.startsWith(m));
  }

  async *createStream(
    messages: ChatMessage[],
    options: GenerationOptions
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.defaultModel,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stop: options.stopSequences,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield {
          type: 'content',
          content: delta.content,
        };
      }

      // Usage info comes in the final chunk
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          },
        };
      }
    }

    yield { type: 'done' };
  }
}

// DeepSeek adapter — uses OpenAI-compatible API
function createDeepSeekAdapter(apiKey: string): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
    supportedModels: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
  });
}

// GPT adapter
function createGPTAdapter(apiKey: string): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    apiKey,
    supportedModels: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4-turbo',
  });
}
```

### 6. IPC 流式传输

Electron 主进程与渲染进程之间的流式数据传输：

```typescript
// main.ts — IPC handler for AI chat streaming

import { ipcMain, BrowserWindow } from 'electron';

ipcMain.on(
  'ai:chat',
  async (event, channel: string, request: ChatRequest) => {
    try {
      // Step 1: Assemble context
      const context = await contextAssembler.assemble({
        sessionId: request.sessionId,
        userMessage:
          request.messages[request.messages.length - 1]?.content ?? '',
        currentFile: request.context?.currentFile,
        manualRefs: request.context?.manualRefs ?? [],
        memberRefs: request.context?.memberRefs ?? [],
        targetModel: request.model,
      });

      // Step 2: Stream AI response
      const enrichedRequest: ChatRequest = { ...request, context };
      const stream = aiGateway.chat(enrichedRequest);

      for await (const chunk of stream) {
        // Send each chunk to renderer via the dedicated channel
        if (!event.sender.isDestroyed()) {
          event.sender.send(channel, chunk);
        } else {
          // Renderer window was closed — abort the stream
          break;
        }
      }
    } catch (error) {
      console.error('AI chat stream error:', error);
      if (!event.sender.isDestroyed()) {
        event.sender.send(channel, {
          type: 'error',
          error: {
            code: 'unknown',
            message: `AI 调用失败: ${String(error)}`,
            retryable: false,
          },
        } satisfies StreamChunk);
      }
    }
  }
);
```

```typescript
// preload.ts — Expose streaming API to renderer

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Start an AI chat session with streaming response.
   * Returns an async iterable that yields StreamChunk objects.
   */
  chatWithAI: async function* (
    request: ChatRequest
  ): AsyncGenerator<StreamChunk> {
    const channel = `ai:stream:${request.sessionId}:${Date.now()}`;
    ipcRenderer.send('ai:chat', channel, request);

    // Create a queue-based async iterable for IPC messages
    const queue: StreamChunk[] = [];
    let resolve: ((value: StreamChunk) => void) | null = null;
    let done = false;

    const listener = (_event: Electron.IpcRendererEvent, chunk: StreamChunk) => {
      if (resolve) {
        resolve(chunk);
        resolve = null;
      } else {
        queue.push(chunk);
      }

      if (chunk.type === 'done' || chunk.type === 'error') {
        done = true;
        ipcRenderer.removeListener(channel, listener);
      }
    };

    ipcRenderer.on(channel, listener);

    try {
      while (!done) {
        const chunk =
          queue.shift() ??
          (await new Promise<StreamChunk>((r) => {
            resolve = r;
          }));

        yield chunk;

        if (chunk.type === 'done' || chunk.type === 'error') {
          return;
        }
      }
    } finally {
      ipcRenderer.removeListener(channel, listener);
    }
  },
});
```

### 7. React 流式渲染

在渲染进程中消费流式响应并实时更新 UI：

```typescript
// hooks/useAIChat.ts

import { useState, useCallback, useRef } from 'react';

interface UseAIChatOptions {
  /** Called when streaming starts */
  onStreamStart?: () => void;
  /** Called when streaming ends */
  onStreamEnd?: (usage?: TokenUsage) => void;
  /** Called on error */
  onError?: (error: StreamError) => void;
}

interface UseAIChatReturn {
  /** Current streaming content */
  streamingContent: string;
  /** Whether AI is currently generating */
  isStreaming: boolean;
  /** Token usage from the last completion */
  usage: TokenUsage | null;
  /** Error from the last request */
  error: StreamError | null;
  /** Send a message to the AI */
  sendMessage: (message: string) => Promise<void>;
  /** Abort the current stream */
  abort: () => void;
}

function useAIChat(options?: UseAIChatOptions): UseAIChatReturn {
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [error, setError] = useState<StreamError | null>(null);
  const abortRef = useRef(false);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      setIsStreaming(true);
      setStreamingContent('');
      setError(null);
      setUsage(null);
      abortRef.current = false;
      options?.onStreamStart?.();

      try {
        const request: ChatRequest = {
          sessionId: crypto.randomUUID(),
          model: 'claude-3-sonnet', // or from user settings
          mode: 'chat',
          messages: [{ role: 'user', content: message }],
          context: {} as AssembledContext, // assembled by main process
        };

        const stream = window.electronAPI.chatWithAI(request);
        let accumulated = '';

        for await (const chunk of stream) {
          if (abortRef.current) break;

          switch (chunk.type) {
            case 'content':
              accumulated += chunk.content ?? '';
              setStreamingContent(accumulated);
              break;

            case 'usage':
              setUsage(chunk.usage ?? null);
              break;

            case 'error':
              setError(chunk.error ?? null);
              options?.onError?.(chunk.error!);
              break;

            case 'done':
              options?.onStreamEnd?.(chunk.usage);
              break;
          }
        }
      } catch (err) {
        const streamError: StreamError = {
          code: 'unknown',
          message: `请求失败: ${String(err)}`,
          retryable: false,
        };
        setError(streamError);
        options?.onError?.(streamError);
      } finally {
        setIsStreaming(false);
      }
    },
    [options]
  );

  return {
    streamingContent,
    isStreaming,
    usage,
    error,
    sendMessage,
    abort,
  };
}
```

```typescript
// components/ChatPanel.tsx

import { useAIChat } from '../hooks/useAIChat';
import { MarkdownRenderer } from './MarkdownRenderer';

function ChatPanel() {
  const {
    streamingContent,
    isStreaming,
    usage,
    error,
    sendMessage,
    abort,
  } = useAIChat({
    onError: (err) => {
      console.error('AI chat error:', err);
    },
  });

  const handleSubmit = async (message: string) => {
    await sendMessage(message);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message display area */}
      <div className="flex-1 overflow-y-auto p-4">
        {streamingContent && (
          <div className="prose dark:prose-invert max-w-none">
            <MarkdownRenderer content={streamingContent} />
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
            <p className="font-medium">AI 响应出错</p>
            <p className="text-sm mt-1">{error.message}</p>
            {error.retryable && (
              <button
                className="mt-2 text-sm underline"
                onClick={() => sendMessage('请重试上一个问题')}
              >
                点击重试
              </button>
            )}
          </div>
        )}

        {usage && !isStreaming && (
          <div className="text-xs text-gray-400 mt-2">
            Token 使用: {usage.promptTokens} (输入) + {usage.completionTokens}{' '}
            (输出) = {usage.totalTokens} (总计)
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isStreaming}
          onAbort={abort}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
```

### 8. Token 计算

使用 tiktoken 进行精确的 Token 计算，为预算管理提供数据支撑：

```typescript
// services/TokenCounter.ts

import { encoding_for_model, TiktokenModel } from 'tiktoken';

interface TokenCounter {
  /** Count tokens for a given text */
  count(text: string): number;
  /** Count tokens for a message array */
  countMessages(messages: ChatMessage[]): number;
}

class TiktokenCounter implements TokenCounter {
  private readonly encoding: ReturnType<typeof encoding_for_model>;

  constructor(model: TiktokenModel = 'gpt-4') {
    // tiktoken works for OpenAI models; for Claude we use
    // a similar tokenizer as an approximation
    this.encoding = encoding_for_model(model);
  }

  count(text: string): number {
    return this.encoding.encode(text).length;
  }

  countMessages(messages: ChatMessage[]): number {
    let total = 0;

    for (const message of messages) {
      // Every message has overhead: role tokens + content delimiters
      total += 4; // <|start|>role\n ... <|end|>
      total += this.count(message.content);
    }

    // Reply priming overhead
    total += 3;

    return total;
  }

  /** Release WASM resources */
  dispose(): void {
    this.encoding.free();
  }
}

/**
 * Approximate token counter for quick estimates
 * when tiktoken is not available or speed is critical.
 *
 * Uses the common heuristic: ~4 characters per token for English,
 * ~2 characters per token for CJK text.
 */
class ApproximateTokenCounter implements TokenCounter {
  count(text: string): number {
    // Count CJK characters
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length;
    const nonCjkLength = text.length - cjkCount;

    return Math.ceil(nonCjkLength / 4) + Math.ceil(cjkCount / 2);
  }

  countMessages(messages: ChatMessage[]): number {
    let total = 0;
    for (const message of messages) {
      total += 4 + this.count(message.content);
    }
    return total + 3;
  }
}
```

## 开发工作流

### 1. 目录结构

```
src/main/services/
├── ai/
│   ├── AIGateway.ts               # 统一 AI 网关
│   ├── TokenCounter.ts            # Token 计算
│   ├── types.ts                   # 类型定义
│   └── adapters/
│       ├── ClaudeAdapter.ts       # Claude 适配器
│       ├── OpenAICompatibleAdapter.ts  # OpenAI/DeepSeek 适配器
│       └── GeminiAdapter.ts       # Gemini 适配器
└── context/
    └── ContextAssembler.ts        # 上下文引擎（see ai-context-engine skill）

src/renderer/
├── hooks/
│   └── useAIChat.ts               # AI 聊天 Hook
├── components/
│   ├── ChatPanel.tsx              # 聊天面板
│   ├── ChatInput.tsx              # 输入框
│   └── MarkdownRenderer.tsx       # Markdown 渲染
└── stores/
    └── chatStore.ts               # 聊天状态管理 (Zustand)
```

### 2. API Key 安全管理

API Key 遵循 BYOK（Bring Your Own Key）模式，加密存储在本地：

```typescript
// services/KeyManager.ts

import { safeStorage } from 'electron';

class KeyManager {
  private readonly store: ElectronStore;

  /** Encrypt and store an API key locally */
  setApiKey(provider: string, apiKey: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('System encryption not available');
    }

    const encrypted = safeStorage.encryptString(apiKey);
    this.store.set(`apiKeys.${provider}`, encrypted.toString('base64'));
  }

  /** Decrypt and retrieve an API key */
  getApiKey(provider: string): string | null {
    const encrypted = this.store.get(`apiKeys.${provider}`) as
      | string
      | undefined;
    if (!encrypted) return null;

    const buffer = Buffer.from(encrypted, 'base64');
    return safeStorage.decryptString(buffer);
  }
}
```

**安全原则**（遵循 CLAUDE.md 安全红线）：
- API Key 使用 Electron [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) 加密存储
- API Key 不上传云端，仅存在于用户本地
- 渲染进程不直接接触 API Key
- 所有 AI 调用通过主进程中转

### 3. 测试策略

```typescript
// __tests__/AIGateway.test.ts

describe('AIGateway', () => {
  it('should stream content chunks correctly', async () => {
    const chunks: StreamChunk[] = [];
    for await (const chunk of gateway.chat(mockRequest)) {
      chunks.push(chunk);
    }

    const contentChunks = chunks.filter((c) => c.type === 'content');
    expect(contentChunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1].type).toBe('done');
  });

  it('should retry on rate limit errors', async () => {
    // Mock adapter to throw rate limit on first attempt
    mockAdapter.createStream
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockImplementationOnce(async function* () {
        yield { type: 'content', content: 'retried' };
        yield { type: 'done' };
      });

    const chunks: StreamChunk[] = [];
    for await (const chunk of gateway.chat(mockRequest)) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'content', content: 'retried' })
    );
  });

  it('should not retry on auth errors', async () => {
    mockAdapter.createStream.mockRejectedValue(new Error('401 auth'));

    const chunks: StreamChunk[] = [];
    for await (const chunk of gateway.chat(mockRequest)) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: 'auth', retryable: false }),
      })
    );
  });
});

// __tests__/TokenCounter.test.ts

describe('TiktokenCounter', () => {
  it('should count tokens accurately', () => {
    const counter = new TiktokenCounter('gpt-4');
    const tokens = counter.count('Hello, world!');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  it('should handle CJK text', () => {
    const counter = new TiktokenCounter('gpt-4');
    const tokens = counter.count('你好世界');
    expect(tokens).toBeGreaterThan(0);
  });
});
```

## 常见问题

### 1. 流式响应中途断开

**问题**：AI 响应在生成过程中突然断开。

**解决方案**：
- 检查网络连接稳定性
- 确认 `maxTokens` 参数是否设置过低
- 确认渲染进程窗口未被销毁（检查 `event.sender.isDestroyed()`）
- 添加心跳检测和自动重连机制

### 2. Token 计算不准确

**问题**：tiktoken 对非 OpenAI 模型的 Token 计算存在偏差。

**解决方案**：
- 对 Claude 模型预留 10% 的 Token 缓冲
- 使用 API 返回的实际 usage 数据校正本地计算
- 对关键场景（如预算接近上限时）使用保守估计

### 3. 多窗口并发流式请求

**问题**：多个窗口同时发起 AI 请求导致响应混乱。

**解决方案**：
- 每次请求使用唯一的 IPC channel（`ai:stream:${sessionId}:${timestamp}`）
- 在 IPC listener 中检查 `event.sender` 确保消息发送到正确窗口
- 考虑请求队列或并发限制，避免 API 限流

## 参考资源

- [Anthropic Claude API 文档](https://docs.anthropic.com/claude/reference)
- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs)
- [tiktoken 文档](https://github.com/openai/tiktoken)
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Server-Sent Events 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)

## 总结

LLM 流式集成的核心原则：

1. **统一网关**：适配器模式屏蔽不同 LLM 提供商差异
2. **安全隔离**：API Key 加密本地存储，AI 调用仅在主进程中执行
3. **流式传输**：主进程通过 IPC 逐块转发流式数据到渲染进程
4. **错误恢复**：指数退避重试 + 错误分类 + 用户友好提示
5. **Token 管理**：tiktoken 精确计算 + 近似估算兜底
6. **React 集成**：自定义 Hook 封装流式消费逻辑，组件关注渲染
