---
name: ai-context-engine
description: >-
  AI 上下文引擎设计与实现最佳实践。当需要设计三层上下文模型（始终加载、语义相关、手动引用）、实现 Token 预算管理与裁剪策略、集成语义搜索（embedding + 向量检索）、构建上下文组装算法、集成 MCP（Model Context Protocol）、或设计记忆系统与上下文的交互时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - ai
    - context-engine
    - embedding
    - semantic-search
    - mcp
    - typescript
---

# AI 上下文引擎

此 skill 提供 AI 上下文引擎的设计与实现指南，涵盖三层上下文模型、Token 预算管理、语义搜索集成、上下文组装算法、MCP 集成等核心主题。上下文引擎是 Sibylla 的核心差异化组件，决定了 AI 能否获得精准的项目上下文。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 设计或实现三层上下文模型（始终加载、语义相关、手动引用）
- 实现 Token 预算管理与裁剪策略
- 集成语义搜索（embedding 生成、向量检索、混合检索）
- 构建上下文组装算法（优先级排序、去重、格式化）
- 集成 MCP（Model Context Protocol）客户端
- 设计记忆系统（MEMORY.md、daily logs、archives）与上下文的交互
- 优化上下文质量与 token 利用率

## 核心概念

### 1. 三层上下文模型

上下文引擎采用三层模型，按优先级组装 AI 所需的项目上下文：

```
┌─────────────────────────────────────────────┐
│         第一层 - 始终加载 (Always Load)        │
│  - CLAUDE.md 项目宪法                         │
│  - MEMORY.md 精选记忆                         │
│  - personal/_spec.md 个人偏好                  │
│  - 当前打开的文件内容                           │
│  优先级：最高，不可裁剪                          │
├─────────────────────────────────────────────┤
│         第二层 - 语义相关 (Semantic)            │
│  - 语义搜索 Top 5-10 片段                     │
│  - 当前文件夹 _spec.md                        │
│  - 相关文件的上下文片段                         │
│  优先级：中，按相关性排序可裁剪                    │
├─────────────────────────────────────────────┤
│         第三层 - 手动引用 (Manual Refs)         │
│  - @文件名 显式引用                            │
│  - @成员名 工作内容                            │
│  优先级：高，用户意图优先                        │
└─────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────┐
  │ 上下文组装器   │ → Token 预算管理 → 最终 Prompt
  └──────────────┘
```

**关键原则**：
- 第一层始终加载，占据固定 token 预算
- 第二层按语义相关性排序，在 token 预算紧张时优先裁剪
- 第三层由用户显式指定，视为用户意图的延伸，优先级仅次于第一层
- 为模型回复预留至少 30% 的 token 窗口

### 2. 上下文引擎接口设计

上下文引擎运行在 Electron 主进程中，通过 IPC 接收渲染进程的请求：

```typescript
// types/context.ts

/** Context assembly request from the renderer */
interface ContextRequest {
  /** Unique session identifier */
  sessionId: string;
  /** Current user prompt */
  userMessage: string;
  /** Currently open file path */
  currentFile?: string;
  /** Explicitly referenced files via @mention */
  manualRefs: string[];
  /** Explicitly referenced team members via @mention */
  memberRefs: string[];
  /** Target model identifier for token budget calculation */
  targetModel: string;
}

/** Assembled context ready for LLM consumption */
interface AssembledContext {
  /** System prompt including project conventions */
  systemPrompt: string;
  /** Context segments ordered by priority */
  segments: ContextSegment[];
  /** Total tokens used by the assembled context */
  totalTokens: number;
  /** Token budget remaining for model response */
  remainingBudget: number;
  /** Metadata about context assembly decisions */
  metadata: AssemblyMetadata;
}

/** Individual context segment */
interface ContextSegment {
  /** Unique segment identifier */
  id: string;
  /** Source layer: always_load | semantic | manual_ref */
  layer: 'always_load' | 'semantic' | 'manual_ref';
  /** Content source path or identifier */
  source: string;
  /** Actual content text */
  content: string;
  /** Token count for this segment */
  tokenCount: number;
  /** Relevance score (0-1, only for semantic layer) */
  relevanceScore?: number;
  /** Whether this segment was truncated due to budget */
  truncated: boolean;
}

/** Metadata about the assembly process */
interface AssemblyMetadata {
  /** Total candidate segments before filtering */
  candidateCount: number;
  /** Segments included in final context */
  includedCount: number;
  /** Segments excluded due to budget constraints */
  excludedCount: number;
  /** Token budget allocation breakdown */
  budgetAllocation: {
    alwaysLoad: number;
    semantic: number;
    manualRef: number;
    reserved: number;
  };
  /** Assembly duration in milliseconds */
  assemblyTimeMs: number;
}
```

### 3. Token 预算管理

Token 预算管理是上下文引擎的核心机制，确保 AI 获得最高质量的上下文：

```typescript
// services/TokenBudgetManager.ts

interface ModelConfig {
  /** Model identifier */
  modelId: string;
  /** Maximum context window size in tokens */
  maxContextTokens: number;
  /** Recommended response reservation ratio */
  responseReserveRatio: number;
}

/** Default model configurations */
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'claude-3-opus': {
    modelId: 'claude-3-opus',
    maxContextTokens: 200000,
    responseReserveRatio: 0.30,
  },
  'claude-3-sonnet': {
    modelId: 'claude-3-sonnet',
    maxContextTokens: 200000,
    responseReserveRatio: 0.30,
  },
  'gpt-4-turbo': {
    modelId: 'gpt-4-turbo',
    maxContextTokens: 128000,
    responseReserveRatio: 0.30,
  },
  'deepseek-chat': {
    modelId: 'deepseek-chat',
    maxContextTokens: 64000,
    responseReserveRatio: 0.30,
  },
};

class TokenBudgetManager {
  private readonly modelConfig: ModelConfig;
  private readonly tokenCounter: TokenCounter;

  constructor(modelId: string, tokenCounter: TokenCounter) {
    const config = MODEL_CONFIGS[modelId];
    if (!config) {
      throw new Error(`Unsupported model: ${modelId}`);
    }
    this.modelConfig = config;
    this.tokenCounter = tokenCounter;
  }

  /** Calculate available token budget for context */
  getContextBudget(): number {
    const { maxContextTokens, responseReserveRatio } = this.modelConfig;
    return Math.floor(maxContextTokens * (1 - responseReserveRatio));
  }

  /** Allocate budget across context layers */
  allocateBudget(
    alwaysLoadTokens: number,
    manualRefTokens: number
  ): BudgetAllocation {
    const totalBudget = this.getContextBudget();

    // Layer 1 (always load) and Layer 3 (manual refs) are fixed
    const fixedTokens = alwaysLoadTokens + manualRefTokens;

    if (fixedTokens > totalBudget) {
      // Even required context exceeds budget — need to truncate
      return {
        alwaysLoad: Math.min(alwaysLoadTokens, totalBudget * 0.7),
        semantic: 0,
        manualRef: Math.min(manualRefTokens, totalBudget * 0.3),
        reserved: 0,
        overBudget: true,
      };
    }

    // Remaining budget goes to semantic layer
    const semanticBudget = totalBudget - fixedTokens;

    return {
      alwaysLoad: alwaysLoadTokens,
      semantic: semanticBudget,
      manualRef: manualRefTokens,
      reserved: this.modelConfig.maxContextTokens - totalBudget,
      overBudget: false,
    };
  }

  /** Count tokens for a given text */
  countTokens(text: string): number {
    return this.tokenCounter.count(text);
  }
}

interface BudgetAllocation {
  alwaysLoad: number;
  semantic: number;
  manualRef: number;
  reserved: number;
  overBudget: boolean;
}
```

**预算分配策略**：
- 第一层（始终加载）+ 第三层（手动引用）优先分配，这些是用户意图的直接体现
- 第二层（语义相关）使用剩余预算，按相关性排序裁剪
- 为模型回复预留至少 30% 的 token 窗口
- 当固定层超出预算时，按 70/30 比例分配给始终加载和手动引用

### 4. 上下文组装器

上下文组装器负责收集、排序、裁剪和格式化上下文片段：

```typescript
// services/ContextAssembler.ts

class ContextAssembler {
  private readonly budgetManager: TokenBudgetManager;
  private readonly semanticSearch: SemanticSearchEngine;
  private readonly fileReader: FileReader;
  private readonly memoryManager: MemoryManager;

  /**
   * Assemble context for an AI chat request.
   * This is the main entry point of the context engine,
   * called from the IPC handler when the renderer sends a chat request.
   */
  async assemble(request: ContextRequest): Promise<AssembledContext> {
    const startTime = Date.now();

    // Step 1: Collect all candidate segments
    const [alwaysLoadSegments, manualRefSegments, semanticSegments] =
      await Promise.all([
        this.collectAlwaysLoad(request),
        this.collectManualRefs(request),
        this.collectSemanticContext(request),
      ]);

    // Step 2: Calculate token counts for fixed layers
    const alwaysLoadTokens = this.sumTokens(alwaysLoadSegments);
    const manualRefTokens = this.sumTokens(manualRefSegments);

    // Step 3: Allocate budget
    const allocation = this.budgetManager.allocateBudget(
      alwaysLoadTokens,
      manualRefTokens
    );

    // Step 4: Fit semantic segments into remaining budget
    const fittedSemantic = this.fitToBudget(
      semanticSegments,
      allocation.semantic
    );

    // Step 5: Assemble final context
    const segments = [
      ...alwaysLoadSegments,
      ...manualRefSegments,
      ...fittedSemantic,
    ];

    const totalTokens = this.sumTokens(segments);

    return {
      systemPrompt: this.buildSystemPrompt(alwaysLoadSegments),
      segments,
      totalTokens,
      remainingBudget: allocation.reserved,
      metadata: {
        candidateCount:
          alwaysLoadSegments.length +
          manualRefSegments.length +
          semanticSegments.length,
        includedCount: segments.length,
        excludedCount: semanticSegments.length - fittedSemantic.length,
        budgetAllocation: allocation,
        assemblyTimeMs: Date.now() - startTime,
      },
    };
  }

  /** Collect Layer 1: always-loaded context */
  private async collectAlwaysLoad(
    request: ContextRequest
  ): Promise<ContextSegment[]> {
    const segments: ContextSegment[] = [];

    // CLAUDE.md — project constitution (always first)
    const claudeMd = await this.fileReader.readIfExists('CLAUDE.md');
    if (claudeMd) {
      segments.push(this.createSegment('always_load', 'CLAUDE.md', claudeMd));
    }

    // MEMORY.md — curated team memory
    const memoryMd = await this.fileReader.readIfExists('MEMORY.md');
    if (memoryMd) {
      segments.push(
        this.createSegment('always_load', 'MEMORY.md', memoryMd)
      );
    }

    // personal/_spec.md — personal preferences
    const personalSpec = await this.fileReader.readIfExists(
      'personal/_spec.md'
    );
    if (personalSpec) {
      segments.push(
        this.createSegment('always_load', 'personal/_spec.md', personalSpec)
      );
    }

    // Currently open file
    if (request.currentFile) {
      const currentContent = await this.fileReader.read(request.currentFile);
      segments.push(
        this.createSegment('always_load', request.currentFile, currentContent)
      );
    }

    return segments;
  }

  /** Collect Layer 2: semantic search results */
  private async collectSemanticContext(
    request: ContextRequest
  ): Promise<ContextSegment[]> {
    // Perform hybrid search (vector + full-text) on the user message
    const results = await this.semanticSearch.hybridSearch(
      request.userMessage,
      {
        topK: 10,
        vectorWeight: 0.7,
        fullTextWeight: 0.3,
        excludePaths: [
          // Exclude files already in Layer 1
          'CLAUDE.md',
          'MEMORY.md',
          request.currentFile,
        ].filter(Boolean) as string[],
      }
    );

    // Also check for folder _spec.md
    if (request.currentFile) {
      const folderSpec = await this.findFolderSpec(request.currentFile);
      if (folderSpec) {
        results.unshift({
          path: folderSpec.path,
          content: folderSpec.content,
          score: 1.0, // Folder spec gets highest relevance
        });
      }
    }

    return results.map((result) =>
      this.createSegment('semantic', result.path, result.content, result.score)
    );
  }

  /** Collect Layer 3: manually referenced files and members */
  private async collectManualRefs(
    request: ContextRequest
  ): Promise<ContextSegment[]> {
    const segments: ContextSegment[] = [];

    // @file references
    for (const filePath of request.manualRefs) {
      const content = await this.fileReader.read(filePath);
      segments.push(this.createSegment('manual_ref', filePath, content));
    }

    // @member references — load their recent work context
    for (const member of request.memberRefs) {
      const memberContext = await this.memoryManager.getMemberContext(member);
      if (memberContext) {
        segments.push(
          this.createSegment('manual_ref', `@${member}`, memberContext)
        );
      }
    }

    return segments;
  }

  /** Fit segments into a token budget, sorted by relevance */
  private fitToBudget(
    segments: ContextSegment[],
    budget: number
  ): ContextSegment[] {
    // Sort by relevance score descending
    const sorted = [...segments].sort(
      (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
    );

    const fitted: ContextSegment[] = [];
    let usedTokens = 0;

    for (const segment of sorted) {
      if (usedTokens + segment.tokenCount <= budget) {
        fitted.push(segment);
        usedTokens += segment.tokenCount;
      } else {
        // Try to fit a truncated version
        const remainingBudget = budget - usedTokens;
        if (remainingBudget > 100) {
          // Minimum useful size
          const truncated = this.truncateSegment(segment, remainingBudget);
          fitted.push(truncated);
          break;
        }
      }
    }

    return fitted;
  }

  private createSegment(
    layer: ContextSegment['layer'],
    source: string,
    content: string,
    relevanceScore?: number
  ): ContextSegment {
    return {
      id: `${layer}:${source}`,
      layer,
      source,
      content,
      tokenCount: this.budgetManager.countTokens(content),
      relevanceScore,
      truncated: false,
    };
  }

  private truncateSegment(
    segment: ContextSegment,
    maxTokens: number
  ): ContextSegment {
    // Simple truncation — in production, use smarter strategies
    // like keeping the first and last paragraphs
    const truncatedContent = this.truncateToTokens(
      segment.content,
      maxTokens
    );
    return {
      ...segment,
      content: truncatedContent,
      tokenCount: maxTokens,
      truncated: true,
    };
  }

  private sumTokens(segments: ContextSegment[]): number {
    return segments.reduce((sum, seg) => sum + seg.tokenCount, 0);
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    // Approximate: split by sentences and accumulate
    const sentences = text.split(/(?<=[.!?。！？\n])\s*/);
    let tokens = 0;
    const kept: string[] = [];

    for (const sentence of sentences) {
      const sentenceTokens = this.budgetManager.countTokens(sentence);
      if (tokens + sentenceTokens > maxTokens) break;
      kept.push(sentence);
      tokens += sentenceTokens;
    }

    return kept.join(' ') + '\n\n[... truncated due to token budget]';
  }

  private buildSystemPrompt(alwaysLoadSegments: ContextSegment[]): string {
    return alwaysLoadSegments.map((seg) => seg.content).join('\n\n---\n\n');
  }

  private async findFolderSpec(
    filePath: string
  ): Promise<{ path: string; content: string } | null> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    const specPath = `${dir}/_spec.md`;
    const content = await this.fileReader.readIfExists(specPath);
    if (content) {
      return { path: specPath, content };
    }
    return null;
  }
}
```

### 5. 语义搜索引擎

语义搜索引擎提供混合检索能力（向量检索 + 全文搜索），是上下文引擎第二层的核心：

```typescript
// services/SemanticSearchEngine.ts

interface SearchOptions {
  /** Maximum number of results */
  topK: number;
  /** Weight for vector similarity (0-1) */
  vectorWeight: number;
  /** Weight for full-text relevance (0-1) */
  fullTextWeight: number;
  /** Paths to exclude from results */
  excludePaths?: string[];
}

interface SearchResult {
  path: string;
  content: string;
  score: number;
}

class SemanticSearchEngine {
  private readonly embeddingModel: EmbeddingModel;
  private readonly vectorStore: VectorStore;
  private readonly ftsIndex: FullTextSearchIndex;

  /**
   * Hybrid search combining vector similarity and full-text matching.
   *
   * Uses Reciprocal Rank Fusion (RRF) to merge results
   * from both retrieval methods:
   *   RRF(d) = Σ 1 / (k + rank_i(d))
   * where k = 60 (standard RRF constant).
   */
  async hybridSearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Run vector and full-text searches in parallel
    const [vectorResults, ftsResults] = await Promise.all([
      this.vectorSearch(query, options.topK * 2),
      this.fullTextSearch(query, options.topK * 2),
    ]);

    // Reciprocal Rank Fusion
    const RRF_K = 60;
    const scores = new Map<string, number>();

    vectorResults.forEach((result, rank) => {
      const rrf = options.vectorWeight / (RRF_K + rank);
      scores.set(result.path, (scores.get(result.path) ?? 0) + rrf);
    });

    ftsResults.forEach((result, rank) => {
      const rrf = options.fullTextWeight / (RRF_K + rank);
      scores.set(result.path, (scores.get(result.path) ?? 0) + rrf);
    });

    // Merge and sort by combined score
    const allResults = new Map<string, SearchResult>();
    for (const result of [...vectorResults, ...ftsResults]) {
      if (!allResults.has(result.path)) {
        allResults.set(result.path, result);
      }
    }

    return Array.from(allResults.values())
      .filter(
        (r) => !options.excludePaths?.includes(r.path)
      )
      .map((r) => ({ ...r, score: scores.get(r.path) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  /** Generate embedding for a text query */
  private async vectorSearch(
    query: string,
    topK: number
  ): Promise<SearchResult[]> {
    // Use @xenova/transformers for local embedding
    // Model: all-MiniLM-L6-v2 (384 dimensions)
    const queryEmbedding = await this.embeddingModel.embed(query);
    return this.vectorStore.search(queryEmbedding, topK);
  }

  /** Full-text search using SQLite FTS5 */
  private async fullTextSearch(
    query: string,
    topK: number
  ): Promise<SearchResult[]> {
    return this.ftsIndex.search(query, topK);
  }
}
```

**技术选型**：
- 本地 Embedding：[`@xenova/transformers`](https://github.com/xenova/transformers.js)（ONNX 模型，Node.js 运行）
- 模型：`all-MiniLM-L6-v2`（384 维向量）
- 向量存储：SQLite + [`sqlite-vec`](https://github.com/asg017/sqlite-vec)
- 全文搜索：SQLite FTS5
- 检索融合：Reciprocal Rank Fusion（向量权重 0.7 + 全文权重 0.3）

### 6. 记忆系统集成

上下文引擎与记忆系统紧密集成，记忆是上下文的重要来源：

```typescript
// services/MemoryManager.ts（上下文引擎调用接口）

interface MemoryManager {
  /** Get curated memory (MEMORY.md) — always loaded in Layer 1 */
  getMemory(): Promise<Memory>;

  /** Query daily logs for recent context */
  queryLogs(query: LogQuery): Promise<LogEntry[]>;

  /** Search archives via vector retrieval */
  queryArchives(query: ArchiveQuery): Promise<Archive[]>;

  /** Semantic search across all memory layers */
  semanticSearch(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]>;

  /** Get a team member's recent work context */
  getMemberContext(memberName: string): Promise<string | null>;

  /** Trigger a heartbeat checkpoint to update memory */
  triggerCheckpoint(): Promise<CheckpointResult>;
}
```

**记忆系统与上下文引擎的关系**：
- `MEMORY.md`（精选记忆）→ 始终加载到第一层，确保 AI 拥有团队共享记忆
- Daily Logs → 可通过语义搜索进入第二层上下文
- Archives → 通过向量检索为第二层提供历史上下文
- 心跳检查点：每 2 小时或 50 条交互触发记忆更新
- 预压缩冲洗：会话 token 达到 75% 时自动持久化关键信息

### 7. MCP 集成

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 提供标准化的上下文提供方式：

```typescript
// services/MCPClient.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPContextProvider {
  /** MCP server name */
  name: string;
  /** MCP server command and args */
  command: string;
  args: string[];
  /** Resource URIs this server provides */
  resources: string[];
}

class MCPClient {
  private readonly clients: Map<string, Client> = new Map();

  /** Connect to an MCP server */
  async connect(provider: MCPContextProvider): Promise<void> {
    const transport = new StdioClientTransport({
      command: provider.command,
      args: provider.args,
    });

    const client = new Client(
      { name: 'sibylla-context-engine', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clients.set(provider.name, client);
  }

  /** Fetch context from an MCP resource */
  async getResource(
    serverName: string,
    uri: string
  ): Promise<string | null> {
    const client = this.clients.get(serverName);
    if (!client) return null;

    try {
      const result = await client.readResource({ uri });
      return result.contents
        .map((c) => c.text ?? '')
        .join('\n');
    } catch (error) {
      console.error(
        `Failed to read MCP resource ${uri} from ${serverName}:`,
        error
      );
      return null;
    }
  }

  /** Disconnect all MCP servers */
  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch (error) {
        console.error(`Failed to disconnect MCP server ${name}:`, error);
      }
    }
    this.clients.clear();
  }
}
```

### 8. IPC 集成

上下文引擎通过 IPC 与渲染进程通信：

```typescript
// main.ts — IPC handler registration

import { ipcMain } from 'electron';

// Context assembly for AI chat
ipcMain.handle(
  'context:assemble',
  async (_event, request: ContextRequest): Promise<AssembledContext> => {
    try {
      return await contextAssembler.assemble(request);
    } catch (error) {
      console.error('Context assembly failed:', error);
      throw error;
    }
  }
);

// Semantic search (exposed for UI search features)
ipcMain.handle(
  'context:search',
  async (
    _event,
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> => {
    try {
      return await semanticSearchEngine.hybridSearch(query, {
        topK: options?.topK ?? 10,
        vectorWeight: 0.7,
        fullTextWeight: 0.3,
      });
    } catch (error) {
      console.error('Semantic search failed:', error);
      throw error;
    }
  }
);

// Index a file for search (called after file save)
ipcMain.handle(
  'context:indexFile',
  async (_event, filePath: string, content: string): Promise<void> => {
    try {
      await semanticSearchEngine.indexFile(filePath, content);
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
      throw error;
    }
  }
);
```

## 开发工作流

### 1. 目录结构

上下文引擎相关代码在 Electron 主进程中：

```
src/main/services/
├── context/
│   ├── ContextAssembler.ts      # 上下文组装器
│   ├── TokenBudgetManager.ts    # Token 预算管理
│   ├── SemanticSearchEngine.ts  # 语义搜索引擎
│   ├── MCPClient.ts             # MCP 客户端
│   └── types.ts                 # 类型定义
├── memory/
│   ├── MemoryManager.ts         # 记忆管理器
│   ├── DailyLogWriter.ts        # 日志写入器
│   └── ArchiveManager.ts        # 归档管理器
└── ai/
    └── AIGateway.ts             # AI 网关（调用上下文引擎）
```

### 2. 调用链路

```
渲染进程（ChatUI）
  │── ipc:ai:chat ──────────→ 主进程
  │                             │── ContextEngine.assemble()
  │                             │   ├── collectAlwaysLoad()
  │                             │   ├── collectManualRefs()
  │                             │   ├── collectSemanticContext()
  │                             │   └── fitToBudget()
  │                             │── AIGateway.send(assembledContext)
  │←─ ipc:ai:stream ──────────│   (streaming response)
```

### 3. 测试策略

```typescript
// __tests__/ContextAssembler.test.ts

describe('ContextAssembler', () => {
  it('should always include CLAUDE.md in Layer 1', async () => {
    const result = await assembler.assemble(mockRequest);
    const claudeSegment = result.segments.find(
      (s) => s.source === 'CLAUDE.md'
    );
    expect(claudeSegment).toBeDefined();
    expect(claudeSegment?.layer).toBe('always_load');
  });

  it('should respect token budget and truncate semantic layer', async () => {
    const result = await assembler.assemble(mockRequest);
    expect(result.totalTokens).toBeLessThanOrEqual(
      budgetManager.getContextBudget()
    );
  });

  it('should sort semantic results by relevance score', async () => {
    const result = await assembler.assemble(mockRequest);
    const semanticSegments = result.segments.filter(
      (s) => s.layer === 'semantic'
    );
    for (let i = 1; i < semanticSegments.length; i++) {
      expect(semanticSegments[i - 1].relevanceScore).toBeGreaterThanOrEqual(
        semanticSegments[i].relevanceScore ?? 0
      );
    }
  });

  it('should exclude personal space from other members', async () => {
    const result = await assembler.assemble(mockRequest);
    const hasOtherPersonal = result.segments.some(
      (s) =>
        s.source.startsWith('personal/') &&
        !s.source.startsWith(`personal/${mockRequest.memberRefs[0]}`)
    );
    expect(hasOtherPersonal).toBe(false);
  });
});
```

## 常见问题

### 1. Token 预算不足

**问题**：始终加载层 + 手动引用层已经超出 token 预算。

**解决方案**：
- 检查 CLAUDE.md 和 MEMORY.md 是否过大，考虑精简
- 对 MEMORY.md 触发压缩（`memoryManager.compressMemory()`）
- 对大文件的手动引用使用摘要而非全文
- 提示用户减少 @引用数量

### 2. 语义搜索相关性低

**问题**：第二层返回的内容与用户问题不相关。

**解决方案**：
- 调整混合检索权重（增加全文权重以提高精确匹配）
- 检查 embedding 索引是否及时更新
- 考虑对查询进行扩展（query expansion）
- 增加 topK 后用 LLM 重排序（reranking）

### 3. 上下文组装延迟高

**问题**：上下文组装耗时过长，影响用户体验。

**解决方案**：
- 并行执行三层上下文收集（已在 `assemble()` 中使用 `Promise.all`）
- 预热常用文件的 embedding 缓存
- 使用增量索引避免全量重建
- 对 MEMORY.md 等常用内容设置内存缓存

## 参考资源

- [Model Context Protocol 规范](https://modelcontextprotocol.io/)
- [Transformers.js 文档](https://huggingface.co/docs/transformers.js)
- [sqlite-vec 文档](https://github.com/asg017/sqlite-vec)
- [tiktoken 文档](https://github.com/openai/tiktoken)
- [Reciprocal Rank Fusion 论文](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)

## 总结

上下文引擎的核心职责是为 AI 组装精准的项目上下文，遵循以下原则：

1. **三层分层**：始终加载、语义相关、手动引用，按优先级组装
2. **Token 预算管理**：为模型回复预留 30% 窗口，弹性裁剪语义层
3. **混合检索**：向量检索 + 全文搜索 + RRF 融合，提升召回质量
4. **记忆集成**：MEMORY.md 始终加载，archives 按需检索
5. **安全隔离**：个人空间内容不进入其他成员的上下文
6. **性能优先**：并行收集、增量索引、内存缓存
