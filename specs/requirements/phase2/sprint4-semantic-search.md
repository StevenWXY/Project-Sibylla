# Phase 2 Sprint 4 - 语义搜索与上下文增强需求

## 一、概述

### 1.1 目标与价值

实现云端语义搜索，让 AI 能够自动找到与用户提问最相关的文档片段。这是 Sibylla 与其他 AI 工具的关键体验差异——用户不需要手动找文件、手动粘贴内容。

### 1.2 涉及模块

- 模块7：搜索系统（语义搜索）
- 模块4：AI 上下文引擎 v2
- 模块15：记忆系统（精选记忆提取与检查点）

### 1.3 里程碑定义

**完成标志：**
- 云端语义搜索服务可用
- 上下文引擎 v2 能自动搜索相关文件加入上下文
- AI 对话中模糊引用能自动定位文件
- 搜索 UI 展示全文 + 语义混合结果

---

## 二、功能需求

### 需求 2.1 - 云端语义搜索服务

**用户故事：** 作为用户，我想要用自然语言搜索文档，以便找到"上次讨论的会员方案"这类模糊内容。

#### 验收标准

1. When file is pushed to remote, the system shall generate embedding within 30 seconds
2. When user searches with natural language, the system shall return top 10 semantically relevant results within 2 seconds
3. When file is updated, the system shall re-generate embedding for changed chunks
4. When file is deleted, the system shall remove corresponding embeddings
5. When search query is empty, the system shall return empty results

#### 技术规格

**Embedding 流程：**
```typescript
// cloud: src/services/embedding.service.ts
export class EmbeddingService {
  async indexFile(workspaceId: string, filePath: string, content: string): Promise<void> {
    const chunks = this.splitIntoChunks(content, 512)
    const contentHash = this.hash(content)
    
    // 删除旧的 embedding
    await this.db.query(
      'DELETE FROM file_embeddings WHERE workspace_id = $1 AND file_path = $2',
      [workspaceId, filePath]
    )
    
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunks[i]
      })
      
      await this.db.query(`
        INSERT INTO file_embeddings (workspace_id, file_path, content_hash, chunk_index, chunk_text, embedding)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [workspaceId, filePath, contentHash, i, chunks[i], embedding.data[0].embedding])
    }
  }
  
  async search(workspaceId: string, query: string, limit: number = 10): Promise<SearchResult[]> {
    const queryEmbedding = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    })
    
    return await this.db.query(`
      SELECT file_path, chunk_text, 1 - (embedding <=> $1) as relevance_score
      FROM file_embeddings
      WHERE workspace_id = $2
      ORDER BY embedding <=> $1
      LIMIT $3
    `, [queryEmbedding.data[0].embedding, workspaceId, limit])
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 上下文引擎 v2

**用户故事：** 作为用户，我希望 AI 能自动找到相关文档，不需要我手动 @引用。

#### 验收标准

1. When user sends message, the system shall auto-search semantically related files
2. When semantic results are found, the system shall include top 5 relevant chunks in context
3. When AI responds, the system shall annotate which files were referenced
4. When user clicks reference annotation, the system shall open source file
5. When context budget is tight, the system shall prioritize Layer 1 and Layer 3 over Layer 2

#### 技术规格

```typescript
// src/main/services/context-engine.ts
async assembleContextV2(request: ChatRequest): Promise<AssembledContext> {
  const context: ContextLayer[] = []
  
  // 第一层：始终加载
  context.push({
    type: 'always',
    files: [
      await this.loadFile('CLAUDE.md'),
      await this.loadFile(request.currentFile)
    ]
  })
  
  // 第二层：语义相关（新增）
  const semanticResults = await this.cloudSearch.search(
    this.workspaceId,
    request.message,
    5
  )
  context.push({
    type: 'semantic',
    files: semanticResults.map(r => ({
      path: r.file_path,
      content: r.chunk_text,
      relevance: r.relevance_score
    }))
  })
  
  // 第三层：手动引用
  const manualRefs = this.extractFileReferences(request.message)
  for (const ref of manualRefs) {
    context.push({
      type: 'manual',
      files: [await this.loadFile(ref)]
    })
  }
  
  // Token 预算管理
  return this.applyTokenBudget(context, request.model)
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - AI 对话自动搜索

**用户故事：** 作为用户，当我在对话中提到"之前的竞品分析"时，AI 应该自动找到对应文件。

#### 验收标准

1. When user mentions vague reference in chat, the system shall auto-search matching files
2. When AI uses auto-searched files, the system shall show "AI 参考了以下文件" annotation
3. When user clicks file reference, the system shall open file in editor
4. When no relevant files found, the system shall proceed without additional context

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - 搜索 UI 优化

**用户故事：** 作为用户，我想要在搜索面板中同时看到关键词匹配和语义匹配的结果。

#### 验收标准

1. When user types in search box, the system shall show local full-text results immediately
2. When user presses Enter, the system shall also fetch semantic search results
3. When results are displayed, the system shall show mixed results sorted by relevance
4. When result is clicked, the system shall open file and highlight matching content
5. When search has no results, the system shall show "未找到相关内容" message

#### 优先级

P1 - 应该完成

---

### 需求 2.5 - 精选记忆提取

**用户故事：** 作为系统，我需要从日志中提取高价值信息到 MEMORY.md，以便 AI 能够学习团队偏好和项目约定。

#### 功能描述

实现 LLM 驱动的精选记忆提取机制，从原始日志中智能提取关键信息。参考 [`memory-system-design.md`](../../design/memory-system-design.md)。

#### 验收标准

1. When checkpoint is triggered, the system shall analyze recent log entries
2. When high-value information is detected, the system shall extract to MEMORY.md with confidence score
3. When MEMORY.md is updated, the system shall maintain 8K-12K tokens range
4. When token count exceeds 12K, the system shall trigger compression
5. When extraction completes, the system shall log changes with reasoning

#### 技术规格

```typescript
// src/main/services/memory-extractor.ts
export class MemoryExtractor {
  async extractFromLogs(logs: LogEntry[]): Promise<MemoryUpdate[]> {
    const prompt = `
分析以下日志，提取高价值信息：
${logs.map(l => l.summary).join('\n')}

提取以下类型的信息：
1. 用户偏好（工作习惯、沟通风格）
2. 技术决策（选型理由、权衡考虑）
3. 常见问题（问题现象、解决方案）
4. 项目约定（命名规范、流程规则）

输出 JSON 格式：
{
  "updates": [
    {
      "section": "用户偏好",
      "content": "...",
      "reason": "...",
      "confidence": 0.85
    }
  ]
}
    `
    
    const response = await this.ai.generate(prompt)
    return JSON.parse(response).updates
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.6 - 心跳检查点

**用户故事：** 作为系统，我需要定期分析日志并更新记忆，以便持续学习和演化。

#### 功能描述

实现心跳检查点机制，每 2 小时或每 50 条交互触发一次记忆更新。

#### 验收标准

1. When 2 hours elapsed since last checkpoint, the system shall trigger checkpoint
2. When 50 interactions occurred since last checkpoint, the system shall trigger checkpoint
3. When checkpoint runs, the system shall analyze logs and update MEMORY.md
4. When checkpoint completes, the system shall log summary with change count
5. When checkpoint fails, the system shall retry up to 3 times
6. When checkpoint is running, the system shall not block user interaction

#### 技术规格

```typescript
// src/main/services/checkpoint-scheduler.ts
export class CheckpointScheduler {
  private lastCheckpoint: Date
  private interactionCount: number = 0
  
  async start() {
    // 定时触发
    setInterval(() => this.maybeRunCheckpoint('timer'), 2 * 60 * 60 * 1000)
    
    // 交互计数触发
    this.eventBus.on('user-interaction', () => {
      this.interactionCount++
      if (this.interactionCount >= 50) {
        this.maybeRunCheckpoint('count')
      }
    })
  }
  
  private async maybeRunCheckpoint(trigger: 'timer' | 'count') {
    const logs = await this.memoryManager.queryLogs({
      startDate: this.lastCheckpoint.toISOString()
    })
    
    if (logs.length === 0) return
    
    const updates = await this.memoryExtractor.extractFromLogs(logs)
    await this.memoryManager.updateMemory(updates)
    
    this.lastCheckpoint = new Date()
    this.interactionCount = 0
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.7 - 向量检索集成

**用户故事：** 作为系统，我需要对记忆内容建立向量索引，以便支持语义检索。

#### 验收标准

1. When MEMORY.md is updated, the system shall re-index content with embeddings
2. When archive is created, the system shall index archive content
3. When user searches memory, the system shall use hybrid search (vector + full-text)
4. When search results are returned, the system shall include relevance scores
5. When vector index is corrupted, the system shall rebuild automatically

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

- Embedding 生成 < 30 秒/文件
- 语义搜索响应 < 2 秒
- 本地搜索响应 < 100ms
- 上下文组装 < 1 秒

### 3.2 安全要求

- 语义搜索遵循权限控制，不返回无权限文件
- Embedding 向量不可逆推原文
- 云端不存储文档原文，仅存储 embedding

---

## 四、验收检查清单

- [ ] 云端 embedding 生成正常
- [ ] 语义搜索返回相关结果
- [ ] 上下文引擎 v2 自动加载语义相关文件
- [ ] AI 对话中模糊引用自动定位
- [ ] 搜索 UI 展示混合结果
- [ ] 精选记忆提取正常工作
- [ ] 心跳检查点定期触发
- [ ] MEMORY.md 自动更新
- [ ] 向量检索集成完成
- [ ] 权限控制正确
- [ ] 性能指标达标
