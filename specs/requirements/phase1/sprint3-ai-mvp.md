# Phase 1 Sprint 3 - AI 系统 MVP 需求

## 一、概述

### 1.1 目标与价值

实现 Sibylla 的核心差异化能力——AI 拥有全局上下文。让 AI 能够访问 workspace 内所有文档，基于完整项目背景产出高质量结果。这是"团队共享大脑"的第一个可用版本。

### 1.2 涉及模块

- 模块4：AI 系统（MVP 版）
- 模块5：Skill 系统（v1）
- 模块6：Spec 工作流
- 模块7：搜索系统（本地全文搜索）
- 模块15：记忆系统（基础架构）

### 1.3 里程碑定义

**完成标志：**
- AI 对话窗口可用，支持多轮对话
- AI 能够自动加载 CLAUDE.md 和当前文件
- AI 能够通过 @文件名 引用文件
- AI 能够建议修改文件并展示 diff 预览
- Skill 系统可用，能够调用预置 Skill
- 本地全文搜索可用

---

## 二、功能需求

### 需求 2.1 - 上下文引擎 v1

**用户故事：** 作为用户，我希望 AI 能够理解我的项目背景，而不是每次都要重复解释。

#### 功能描述

实现三层上下文模型的第一层（始终加载）和第三层（手动引用）。

#### 验收标准

1. When user sends message to AI, the system shall always include `CLAUDE.md` in context
2. When user is editing file, the system shall include current file content in context
3. When user types `@filename`, the system shall show autocomplete with matching files
4. When user selects file from autocomplete, the system shall include full file content in context
5. When context exceeds token limit, the system shall show warning and truncate oldest messages
6. When AI responds, the system shall show which files were included in context

#### 技术规格

```typescript
// src/main/services/context-engine.ts
export class ContextEngine {
  async assembleContext(request: ChatRequest): Promise<AssembledContext> {
    const context: ContextLayer[] = []
    
    // 第一层：始终加载
    context.push({
      type: 'always',
      files: [
        await this.loadFile('CLAUDE.md'),
        await this.loadFile(request.currentFile)
      ]
    })
    
    // 第三层：手动引用
    const manualRefs = this.extractFileReferences(request.message)
    for (const ref of manualRefs) {
      context.push({
        type: 'manual',
        files: [await this.loadFile(ref)]
      })
    }
    
    return {
      layers: context,
      totalTokens: this.calculateTokens(context),
      sources: this.extractSources(context)
    }
  }
  
  private extractFileReferences(message: string): string[] {
    const regex = /@\[\[([^\]]+)\]\]/g
    const matches = []
    let match
    while ((match = regex.exec(message)) !== null) {
      matches.push(match[1])
    }
    return matches
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - AI 主对话窗口

**用户故事：** 作为用户，我想要与 AI 对话，以便获取帮助和建议。

#### 验收标准

1. When user clicks "AI" tab, the system shall open AI chat window
2. When user types message and presses Enter, the system shall send to AI and show loading indicator
3. When AI responds, the system shall stream response in real-time
4. When response includes code blocks, the system shall apply syntax highlighting
5. When user scrolls up, the system shall load previous conversation history
6. When user starts new conversation, the system shall save current conversation and create new one

#### 技术规格

```typescript
// src/renderer/components/AIChat.tsx
export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const handleSend = async () => {
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    try {
      const stream = await window.api.invoke('ai:chat', {
        messages: [...messages, userMessage],
        currentFile: getCurrentFile()
      })
      
      let assistantMessage = ''
      for await (const chunk of stream) {
        assistantMessage += chunk
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: assistantMessage, timestamp: Date.now() }
        ])
      }
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="ai-chat flex flex-col h-full">
      <div className="messages flex-1 overflow-y-auto">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
      </div>
      <div className="input-area p-4 border-t">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="输入消息... 使用 @文件名 引用文件"
        />
      </div>
    </div>
  )
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - AI 模型网关

**用户故事：** 作为用户，我想要选择不同的 AI 模型，以便根据任务选择最合适的模型。

#### 功能描述

云端 AI 网关统一代理多个模型提供商，支持流式响应。

#### 验收标准

1. When client sends chat request, the system shall route to specified model provider
2. When model is Claude, the system shall use Anthropic API
3. When model is GPT, the system shall use OpenAI API
4. When API call fails, the system shall retry up to 3 times
5. When all retries fail, the system shall return error message to client
6. When response is streaming, the system shall forward chunks to client in real-time

#### 技术规格

```typescript
// src/services/ai-gateway.service.ts
export class AIGatewayService {
  async chat(request: ChatRequest): Promise<AsyncIterable<string>> {
    const provider = this.getProvider(request.model)
    
    try {
      return await provider.chat({
        messages: request.messages,
        model: request.model,
        stream: true
      })
    } catch (error) {
      throw new AIGatewayError(error.message)
    }
  }
  
  private getProvider(model: string): AIProvider {
    if (model.startsWith('claude')) {
      return new AnthropicProvider(this.config.anthropicApiKey)
    } else if (model.startsWith('gpt')) {
      return new OpenAIProvider(this.config.openaiApiKey)
    }
    throw new Error(`Unsupported model: ${model}`)
  }
}

// Provider 接口
interface AIProvider {
  chat(request: ChatRequest): Promise<AsyncIterable<string>>
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - AI 文件修改能力

**用户故事：** 作为用户，当 AI 建议修改文件时，我想要看到 diff 预览并决定是否应用。

#### 验收标准

1. When AI suggests file modification, the system shall parse modification from response
2. When modification is detected, the system shall show diff preview with additions and deletions highlighted
3. When user clicks "应用", the system shall write changes to file
4. When user clicks "编辑", the system shall open editable diff view
5. When user applies changes, the system shall trigger auto-save and commit
6. When AI suggests multiple file changes, the system shall show list of all changes

#### 技术规格

```typescript
// AI 响应格式约定
// AI 在响应中使用特殊标记表示文件修改：
// ```diff:path/to/file.md
// - 旧内容
// + 新内容
// ```

// src/renderer/components/DiffPreview.tsx
interface FileDiff {
  filePath: string
  oldContent: string
  newContent: string
  hunks: DiffHunk[]
}

export function DiffPreview({ diff }: { diff: FileDiff }) {
  const [isApplying, setIsApplying] = useState(false)
  
  const handleApply = async () => {
    setIsApplying(true)
    await window.api.invoke('file:write', diff.filePath, diff.newContent)
    setIsApplying(false)
  }
  
  return (
    <div className="diff-preview border rounded p-4">
      <div className="header flex justify-between items-center mb-2">
       sName="font-mono text-sm">{diff.filePath}</span>
        <div className="actions flex gap-2">
          <button onClick={handleApply} disabled={isApplying}>
            应用
          </button>
          <button>编辑</button>
        </div>
      </div>
      <div className="diff-content font-mono text-sm">
        {diff.hunks.map((hunk, i) => (
          <DiffHunk key={i} hunk={hunk} />
        ))}
      </div>
    </div>
  )
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.5 - Skill 系统 v1

**用户故事：** 作为用户，我想要使用预置的 Skill，以便 AI 按照特定规范产出内容。

#### 功能描述

实现 Skill 的加载、解析和调用机制。

#### 验收标准

1. When workspace is opened, the system shall scan `skills/` directory and load all Skill files
2. When user types `#skill-name`, the system shall show autocomplete with matching Skills
3. When user selects Skill, the system shall include Skill content in AI context
4. When AI responds with Skill active, the system shall follow Skill instructions
5. When Skill file is modified, the system shall reload Skill automatically

#### 技术规格

**Skill 文件格式：**
```markdown
# Skill: 撰写 PRD

## 适用场景
产品需求文档撰写

## AI 行为指令
你是一位经验丰富的产品经理。在撰写 PRD 时，你应该：
1. 明确定义问题和目标
2. 描述用户故事和使用场景
3. 列出功能需求和验收标准
4. 考虑技术可行性和资源约束

## 输出格式
# [功能名称] PRD

## 一、背景与目标
...

## 二、用户故事
...

## 三、功能需求
...
```

**Skill 引擎：**
```typescript
// src/main/services/skill-engine.ts
export class SkillEngine {
  private skills: Map<string, Skill> = new Map()
  
  async loadSkills(): Promise<void> {
    const skillFiles = await this.fileManager.listFiles('skills/')
    for (const file of skillFiles) {
      if (file.name.endsWith('.md') && file.name !== '_index.md') {
        const content = await this.fileManager.readFile(file.path)
        const skill = this.parseSkill(content)
        this.skills.set(skill.name, skill)
      }
    }
  }
  
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name)
  }
  
  private parseSkill(content: string): Skill {
    // 解析 Skill Markdown 文件
    const lines = content.split('\n')
    const skill: Skill = {
      name: '',
      description: '',
      instructions: '',
      outputFormat: ''
    }
    
    // 简单的解析逻辑
    let section = ''
    for (const line of lines) {
      if (line.startsWith('# Skill:')) {
        skill.name = line.replace('# Skill:', '').trim()
      } else if (line.startsWith('## 适用场景')) {
        section = 'description'
      } else if (line.startsWith('## AI 行为指令')) {
        section = 'instructions'
      } else if (line.startsWith('## 输出格式')) {
        section = 'outputFormat'
      } else if (section && line.trim()) {
        skill[section] += line + '\n'
      }
    }
    
    return skill
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.6 - Spec 工作流

**用户故事：** 作为用户，我希望 AI 能够理解项目的核心文档，以便产出符合项目规范的内容。

#### 功能描述

自动识别和加载 Spec 文件（CLAUDE.md、requirements.md、design.md、tasks.md）。

#### 验收标准

1. When AI chat starts, the system shall always load `CLAUDE.md` into context
2. When `requirements.md` exists, the system shall include it in context for planning tasks
3. When `design.md` exists, the system shall include it in context for technical discussions
4. When `tasks.md` exists, the system shall include it in context for task management
5. When Spec files are modified, the system shall reload them in active conversations

#### 技术规格

```typescript
// src/main/services/context-engine.ts
async loadSpecFiles(): Promise<SpecFiles> {
  const specs: SpecFiles = {}
  
  const specFiles = ['CLAUDE.md', 'requirements.md', 'design.md', 'tasks.md']
  for (const file of specFiles) {
    try {
      specs[file] = await this.fileManager.readFile(file)
    } catch (error) {
      // 文件不存在，跳过
    }
  }
  
  return specs
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.7 - 本地全文搜索

**用户故事：** 作为用户，我想要快速搜索文档内容，以便找到需要的信息。

#### 功能描述

实现基于 SQLite FTS5 的本地全文搜索。

#### 验收标准

1. When user types in search box, the system shall show results within 100ms
2. When search returns results, the system shall highlight matching keywords
3. When user clicks result, the system shall open file and scroll to matching position
4. When file is modified, the system shall update search index within 2 seconds
5. When workspace is opened, the system shall build initial index in background

#### 技术规格

```typescript
// src/main/services/local-search.ts
export class LocalSearchEngine {
  private db: Database
  
  async buildIndex(): Promise<void> {
    const files = await this.fileManager.listAllFiles()
    
    for (const file of files) {
      if (this.isTextFile(file.path)) {
        const content = await this.fileManager.readFile(file.path)
        await this.indexFile(file.path, content)
      }
    }
  }
  
  async indexFile(path: string, content: string): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO files_fts (path, content)
      VALUES (?, ?)
    `, [path, content])
  }
  
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    const results = await this.db.all(`
      SELECT path, snippet(files_fts, 1, '<mark>', '</mark>', '...', 64) as snippet
      FROM files_fts
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [query, limit])
    
    return results.map(row => ({
      path: row.path,
      snippet: row.snippet,
      filename: path.basename(row.path)
    }))
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 2.8 - 记忆系统基础架构

**用户故事：** 作为系统，我需要记录用户与 AI 的交互历史，以便 AI 能够学习和演化。

#### 功能描述

实现记忆系统的基础架构，包括日志记录、MEMORY.md 读写和文件锁机制。参考 [`memory-system-design.md`](../../design/memory-system-design.md)。

#### 验收标准

1. When user interacts with AI, the system shall append log entry to `.sibylla/memory/daily/YYYY-MM-DD.md`
2. When log entry is written, the system shall use append-only mode to prevent modification
3. When workspace is opened, the system shall load `MEMORY.md` into AI context
4. When MEMORY.md is updated, the system shall use file lock to prevent concurrent write conflicts
5. When multiple processes write logs, the system shall ensure data integrity
6. When AI modifies file, the system shall log file operation with change summary
7. When error occurs during AI interaction, the system shall log error type and context

#### 技术规格

```typescript
// src/main/services/memory-manager.ts
export class MemoryManager {
  async appendLog(entry: LogEntry): Promise<void>
  async getMemory(): Promise<Memory>
  async updateMemory(updates: MemoryUpdate[]): Promise<void>
}

// src/main/services/file-lock.ts
export class FileLock {
  async acquireExclusive(path: string, timeout: number): Promise<LockHandle>
  async release(handle: LockHandle): Promise<void>
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.9 - AI 交互日志自动记录

**用户故事：** 作为用户，我希望系统自动记录我与 AI 的交互，无需手动操作。

#### 验收标准

1. When user sends message to AI, the system shall automatically log user input summary
2. When AI responds, the system shall log response summary and referenced files
3. When command is executed via AI, the system shall log command and result
4. When log is written, the system shall not block user interaction (async)
5. When daily log file is queried, the system shall return structured log entries

#### 优先级

P0 - 必须完成

---

## 三、非功能需求

### 3.1 性能要求

- AI 响应首字延迟 < 2 秒
- 流式响应延迟 < 100ms/chunk
- 上下文组装 < 500ms
- 搜索响应 < 100ms
- Skill 加载 < 1 秒

### 3.2 安全要求

- 用户 API Key 加密存储在本地
- API Key 不上传云端
- AI 请求通过云端网关代理

### 3.3 可用性要求

- AI 响应有 loading 状态
- 错误信息清晰友好
- 支持中断长时间响应

---

## 四、技术约束

### 4.1 架构约束

- 上下文引擎封装为独立模块
- AI 网关统一代理所有模型
- Skill 以 Markdown 文件存储

### 4.2 技术选型

- AI SDK：@anthropic-ai/sdk、openai
- Token 计算：tiktoken
- 搜索：SQLite FTS5
- Diff：diff-match-patch

---

## 五、验收检查清单

- [ ] AI 对话窗口可用
- [ ] 上下文引擎正确加载文件
- [ ] @文件名 引用正常工作
- [ ] AI 文件修改 diff 预览可用
- [ ] Skill 系统可用
- [ ] Spec 文件自动加载
- [ ] 本地搜索可用
- [ ] 记忆系统基础架构可用
- [ ] AI 交互日志自动记录
- [ ] MEMORY.md 读写正常
- [ ] 文件锁机制工作正常
- [ ] 性能指标达标

---

## 六、预置 Skill 包

MVP 阶段提供通用 Skill 包：

1. `writing-prd.md` - PRD 撰写
2. `writing-design.md` - 技术方案撰写
3. `writing-meeting-notes.md` - 会议纪要
4. `analysis-competitor.md` - 竞品分析
5. `planning-tasks.md` - 任务规划

---

## 七、参考资料

- [Anthropic API 文档](https://docs.anthropic.com/)
- [OpenAI API 文档](https://platform.openai.com/docs/)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [`architecture.md`](../../design/architecture.md) - 上下文引擎架构
