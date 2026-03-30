---
name: sqlite-local-storage
description: >-
  基于 SQLite 的本地数据库设计与优化最佳实践。当需要使用 better-sqlite3 设计数据库 schema、实现全文搜索索引（FTS5）、集成向量检索扩展（sqlite-vec）、管理事务与并发控制、优化查询性能、或在 Electron 主进程中实现本地存储层时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - sqlite
    - better-sqlite3
    - database
    - fts5
    - electron
    - typescript
---

# SQLite 本地存储

此 skill 提供基于 better-sqlite3 的本地数据库设计与优化指南，涵盖数据库 schema 设计、全文搜索（FTS5）、向量检索（sqlite-vec）、事务管理、并发控制、性能优化等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 在 Electron 主进程中集成 better-sqlite3
- 设计 Sibylla 的本地数据库 schema（文件索引、评论、任务等）
- 实现基于 FTS5 的全文搜索功能
- 集成 sqlite-vec 扩展实现向量检索
- 优化数据库查询性能（索引策略、查询分析）
- 实现事务管理与数据完整性保障
- 设计缓存策略（文件索引、语义索引、用户配置、AI 对话历史）
- 处理数据库 migration 与版本管理

## 核心概念

### 1. better-sqlite3 架构定位

在 Sibylla 的架构中，[`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) 运行在 Electron 主进程，承担搜索索引和缓存职责。用户的文档内容以 Markdown 明文存储在本地文件系统中（遵循"文件即真相"原则），SQLite 不存储文档原文，而是维护索引和元数据。

```
┌─────────────────────────────────────────────┐
│            渲染进程 (React UI)                │
│  - 搜索界面                                  │
│  - 文件浏览器                                 │
│  - 任务看板                                   │
└─────────────────┬───────────────────────────┘
                  │ IPC
┌─────────────────▼───────────────────────────┐
│            主进程 (Node.js)                   │
│  ┌──────────────────┐  ┌─────────────────┐  │
│  │  DatabaseManager │  │  FileManager    │  │
│  │  (better-sqlite3)│  │  (文件系统)       │  │
│  │  - 文件索引       │  │  - Markdown 文件 │  │
│  │  - 全文搜索       │  │  - 用户数据      │  │
│  │  - 评论/任务      │  │                 │  │
│  │  - AI 对话历史    │  │                 │  │
│  └──────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────┘
```

**关键原则**：
- SQLite 仅存储索引和元数据，不存储文档原文
- better-sqlite3 只能在 Electron 主进程中使用（原生模块限制）
- 渲染进程通过 IPC 调用数据库操作
- WAL 模式提升并发读写性能

### 2. 数据库初始化与配置

```typescript
// services/DatabaseManager.ts
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

export class DatabaseManager {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(workspacePath: string) {
    this.dbPath = path.join(workspacePath, '.sibylla', 'index.db');
    this.db = this.openDatabase();
    this.configure();
    this.initSchema();
  }

  private openDatabase(): Database.Database {
    const db = new Database(this.dbPath, {
      // Enable verbose logging in development
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

    return db;
  }

  private configure(): void {
    // Enable WAL mode for better concurrent read/write performance
    this.db.pragma('journal_mode = WAL');

    // Set synchronous mode to NORMAL for WAL (good balance of safety and speed)
    this.db.pragma('synchronous = NORMAL');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Set cache size to 64MB
    this.db.pragma('cache_size = -64000');

    // Enable memory-mapped I/O (256MB)
    this.db.pragma('mmap_size = 268435456');
  }

  // Graceful shutdown
  close(): void {
    if (this.db.open) {
      // Optimize before closing
      this.db.pragma('optimize');
      this.db.close();
    }
  }
}
```

**最佳实践**：
- 数据库文件存放在 workspace 的 `.sibylla/` 目录下
- WAL 模式允许并发读取，是 Electron 应用的推荐模式
- `synchronous = NORMAL` 在 WAL 模式下提供足够的数据安全性
- 应用退出时调用 `PRAGMA optimize` 和 `close()` 确保数据完整

### 3. Schema 设计

Sibylla 的本地数据库包含以下核心表：

```typescript
// services/DatabaseManager.ts

private initSchema(): void {
  this.db.exec(`
    -- 文件索引表
    -- Track file metadata for quick lookups without filesystem access
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      last_modified INTEGER NOT NULL,
      size INTEGER NOT NULL,
      is_synced BOOLEAN DEFAULT 1,
      has_conflict BOOLEAN DEFAULT 0
    );

    -- 全文搜索索引（FTS5）
    -- Enables fast full-text search across all workspace files
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path,
      content,
      tokenize = 'unicode61'
    );

    -- 评论元数据
    -- Store inline comments associated with file positions
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      position_start INTEGER,
      position_end INTEGER,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'archived')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
    );

    -- 任务索引（从 Markdown 文件解析提取）
    -- Index tasks extracted from task lists in .md files
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      assignee TEXT,
      status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'cancelled')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      due_date TEXT,
      related_files TEXT,
      source_file TEXT NOT NULL,
      line_number INTEGER,
      FOREIGN KEY (source_file) REFERENCES files(path) ON DELETE CASCADE
    );

    -- AI 对话历史
    -- Persist AI conversation sessions for context continuity
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- AI 对话消息
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      token_count INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    );

    -- 用户配置
    -- Store user preferences and settings locally
    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- 创建常用索引
    CREATE INDEX IF NOT EXISTS idx_files_modified ON files(last_modified);
    CREATE INDEX IF NOT EXISTS idx_files_synced ON files(is_synced);
    CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_path);
    CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
    CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source_file);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_time ON ai_messages(created_at);
  `);
}
```

**设计要点**：
- `files` 表存储文件元数据，用于快速查询文件状态（同步状态、冲突状态）
- `files_fts` 使用 FTS5 虚拟表提供全文搜索能力
- `comments` 和 `tasks` 存储从 Markdown 文件解析出的结构化数据
- `ai_conversations` 和 `ai_messages` 持久化 AI 对话历史
- 所有外键关联使用 `ON DELETE CASCADE` 确保数据一致性

### 4. 类型安全的数据访问层

使用 TypeScript 严格类型封装数据库操作：

```typescript
// types/database.ts

export interface FileRecord {
  path: string;
  content_hash: string;
  last_modified: number;
  size: number;
  is_synced: boolean;
  has_conflict: boolean;
}

export interface CommentRecord {
  id: string;
  file_path: string;
  position_start: number | null;
  position_end: number | null;
  author_id: string;
  content: string;
  status: 'open' | 'resolved' | 'archived';
  created_at: number;
  updated_at: number;
}

export interface TaskRecord {
  id: string;
  title: string;
  assignee: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  due_date: string | null;
  related_files: string | null;
  source_file: string;
  line_number: number | null;
}

export interface AIConversationRecord {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

export interface AIMessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_count: number | null;
  created_at: number;
}

export interface SearchResult {
  path: string;
  snippet: string;
  rank: number;
}
```

```typescript
// services/DatabaseManager.ts (continued)

export class DatabaseManager {
  // --- File Index Operations ---

  getFile(filePath: string): FileRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM files WHERE path = ?');
    return stmt.get(filePath) as FileRecord | undefined;
  }

  upsertFile(file: FileRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (path, content_hash, last_modified, size, is_synced, has_conflict)
      VALUES (@path, @content_hash, @last_modified, @size, @is_synced, @has_conflict)
      ON CONFLICT(path) DO UPDATE SET
        content_hash = excluded.content_hash,
        last_modified = excluded.last_modified,
        size = excluded.size,
        is_synced = excluded.is_synced,
        has_conflict = excluded.has_conflict
    `);
    stmt.run(file);
  }

  deleteFile(filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM files WHERE path = ?');
    stmt.run(filePath);
  }

  getUnsyncedFiles(): FileRecord[] {
    const stmt = this.db.prepare('SELECT * FROM files WHERE is_synced = 0');
    return stmt.all() as FileRecord[];
  }

  getConflictedFiles(): FileRecord[] {
    const stmt = this.db.prepare('SELECT * FROM files WHERE has_conflict = 1');
    return stmt.all() as FileRecord[];
  }

  // --- Full-Text Search Operations ---

  indexFileContent(filePath: string, content: string): void {
    // Use a transaction to ensure atomicity
    const transaction = this.db.transaction(() => {
      // Remove existing index entry
      const deleteStmt = this.db.prepare('DELETE FROM files_fts WHERE path = ?');
      deleteStmt.run(filePath);

      // Insert new index entry
      const insertStmt = this.db.prepare(
        'INSERT INTO files_fts (path, content) VALUES (?, ?)'
      );
      insertStmt.run(filePath, content);
    });

    transaction();
  }

  removeFileIndex(filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM files_fts WHERE path = ?');
    stmt.run(filePath);
  }

  searchFiles(query: string, limit: number = 20): SearchResult[] {
    const stmt = this.db.prepare(`
      SELECT
        path,
        snippet(files_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        rank
      FROM files_fts
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    return stmt.all(query, limit) as SearchResult[];
  }

  // --- Comment Operations ---

  getCommentsByFile(filePath: string): CommentRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM comments WHERE file_path = ? ORDER BY position_start ASC'
    );
    return stmt.all(filePath) as CommentRecord[];
  }

  addComment(comment: CommentRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO comments (id, file_path, position_start, position_end, author_id, content, status, created_at, updated_at)
      VALUES (@id, @file_path, @position_start, @position_end, @author_id, @content, @status, @created_at, @updated_at)
    `);
    stmt.run(comment);
  }

  resolveComment(commentId: string): void {
    const stmt = this.db.prepare(
      'UPDATE comments SET status = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run('resolved', Date.now(), commentId);
  }

  // --- Task Operations ---

  getTasksByStatus(status: TaskRecord['status']): TaskRecord[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ?');
    return stmt.all(status) as TaskRecord[];
  }

  getTasksByAssignee(assignee: string): TaskRecord[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE assignee = ?');
    return stmt.all(assignee) as TaskRecord[];
  }

  upsertTask(task: TaskRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, assignee, status, priority, due_date, related_files, source_file, line_number)
      VALUES (@id, @title, @assignee, @status, @priority, @due_date, @related_files, @source_file, @line_number)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        assignee = excluded.assignee,
        status = excluded.status,
        priority = excluded.priority,
        due_date = excluded.due_date,
        related_files = excluded.related_files,
        source_file = excluded.source_file,
        line_number = excluded.line_number
    `);
    stmt.run(task);
  }

  // Rebuild task index from a Markdown file
  rebuildTasksFromFile(filePath: string, tasks: TaskRecord[]): void {
    const transaction = this.db.transaction(() => {
      // Remove old tasks from this file
      const deleteStmt = this.db.prepare('DELETE FROM tasks WHERE source_file = ?');
      deleteStmt.run(filePath);

      // Insert updated tasks
      const insertStmt = this.db.prepare(`
        INSERT INTO tasks (id, title, assignee, status, priority, due_date, related_files, source_file, line_number)
        VALUES (@id, @title, @assignee, @status, @priority, @due_date, @related_files, @source_file, @line_number)
      `);

      for (const task of tasks) {
        insertStmt.run(task);
      }
    });

    transaction();
  }

  // --- AI Conversation Operations ---

  createConversation(conversation: AIConversationRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO ai_conversations (id, workspace_id, title, created_at, updated_at)
      VALUES (@id, @workspace_id, @title, @created_at, @updated_at)
    `);
    stmt.run(conversation);
  }

  addMessage(message: AIMessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO ai_messages (id, conversation_id, role, content, token_count, created_at)
      VALUES (@id, @conversation_id, @role, @content, @token_count, @created_at)
    `);
    stmt.run(message);

    // Update conversation's updated_at
    const updateStmt = this.db.prepare(
      'UPDATE ai_conversations SET updated_at = ? WHERE id = ?'
    );
    updateStmt.run(message.created_at, message.conversation_id);
  }

  getConversationMessages(conversationId: string): AIMessageRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    );
    return stmt.all(conversationId) as AIMessageRecord[];
  }

  // --- User Settings Operations ---

  getSetting(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM user_settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value, Date.now());
  }
}
```

**最佳实践**：
- 使用 TypeScript 接口定义所有数据库记录类型，禁止 `any`
- 使用 named parameters（`@field`）提高 SQL 可读性
- 所有写入操作使用 prepared statements 防止 SQL 注入
- 批量操作使用事务（`this.db.transaction()`）确保原子性
- UPSERT 模式（`ON CONFLICT ... DO UPDATE`）简化"创建或更新"逻辑

### 5. 全文搜索（FTS5）

FTS5 是 SQLite 内置的全文搜索引擎，为 Sibylla 的文件搜索提供基础：

```typescript
// services/SearchService.ts
import { DatabaseManager } from './DatabaseManager';

export interface SearchOptions {
  query: string;
  limit?: number;
  fileTypes?: string[];
  modifiedAfter?: number;
}

export class SearchService {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  // Basic full-text search
  search(options: SearchOptions): SearchResult[] {
    const { query, limit = 20, fileTypes, modifiedAfter } = options;

    // Sanitize search query for FTS5
    const sanitizedQuery = this.sanitizeFTSQuery(query);

    if (!sanitizedQuery) {
      return [];
    }

    return this.dbManager.searchFiles(sanitizedQuery, limit);
  }

  // Search with file type filter
  searchWithFilter(options: SearchOptions): SearchResult[] {
    const { query, limit = 20, fileTypes } = options;
    const sanitizedQuery = this.sanitizeFTSQuery(query);

    if (!sanitizedQuery) {
      return [];
    }

    // FTS5 prefix query for fuzzy matching
    // Append * for prefix matching: "hello" → "hello*"
    const prefixQuery = sanitizedQuery
      .split(/\s+/)
      .map((term) => `"${term}"*`)
      .join(' ');

    return this.dbManager.searchFiles(prefixQuery, limit);
  }

  // Sanitize query to prevent FTS5 syntax errors
  private sanitizeFTSQuery(query: string): string {
    // Remove special FTS5 operators that could cause syntax errors
    return query
      .replace(/[{}()\[\]^"~*:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Rebuild search index for all files in workspace
  async rebuildIndex(
    workspacePath: string,
    readFile: (path: string) => Promise<string>
  ): Promise<{ indexed: number; errors: string[] }> {
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    const result = { indexed: 0, errors: [] as string[] };

    async function walkDir(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const fullPath = pathModule.join(dir, entry.name);
        // Skip hidden directories and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = await walkDir(fullPath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }

      return files;
    }

    const files = await walkDir(workspacePath);

    for (const file of files) {
      try {
        const relativePath = pathModule.relative(workspacePath, file);
        const content = await readFile(file);
        this.dbManager.indexFileContent(relativePath, content);
        result.indexed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`${file}: ${message}`);
      }
    }

    return result;
  }
}
```

**FTS5 查询语法要点**：
- 基本查询：`"search term"` 短语匹配
- 前缀查询：`term*` 匹配以 term 开头的词
- 布尔操作：`term1 AND term2`、`term1 OR term2`、`NOT term`
- 列限定：`path : "readme"` 仅在 path 列搜索
- `snippet()` 函数返回匹配上下文片段，用于搜索结果展示

### 6. 向量检索（sqlite-vec）

集成 [`sqlite-vec`](https://github.com/asg017/sqlite-vec) 扩展实现语义搜索：

```typescript
// services/VectorSearchService.ts

export interface EmbeddingRecord {
  file_path: string;
  chunk_index: number;
  chunk_text: string;
  embedding: Float32Array;
}

export class VectorSearchService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initVectorTables();
  }

  private initVectorTables(): void {
    // Load sqlite-vec extension
    // The extension must be available as a native module
    try {
      this.db.loadExtension('vec0');
    } catch (err) {
      console.warn('sqlite-vec extension not available, vector search disabled:', err);
      return;
    }

    this.db.exec(`
      -- Store document embeddings
      -- Dimension 1536 matches OpenAI text-embedding-3-small output
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
        embedding float[1536]
      );

      -- Metadata for embedding chunks
      CREATE TABLE IF NOT EXISTS embedding_chunks (
        rowid INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(file_path, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_file ON embedding_chunks(file_path);
    `);
  }

  // Store embeddings for a file's chunks
  storeEmbeddings(filePath: string, chunks: Array<{ text: string; embedding: Float32Array }>): void {
    const transaction = this.db.transaction(() => {
      // Remove old embeddings for this file
      const oldChunks = this.db
        .prepare('SELECT rowid FROM embedding_chunks WHERE file_path = ?')
        .all(filePath) as Array<{ rowid: number }>;

      for (const chunk of oldChunks) {
        this.db.prepare('DELETE FROM vec_embeddings WHERE rowid = ?').run(chunk.rowid);
      }
      this.db.prepare('DELETE FROM embedding_chunks WHERE file_path = ?').run(filePath);

      // Insert new chunks and embeddings
      const insertChunk = this.db.prepare(`
        INSERT INTO embedding_chunks (file_path, chunk_index, chunk_text, created_at)
        VALUES (?, ?, ?, ?)
      `);

      const insertVec = this.db.prepare(
        'INSERT INTO vec_embeddings (rowid, embedding) VALUES (?, ?)'
      );

      for (let i = 0; i < chunks.length; i++) {
        const result = insertChunk.run(filePath, i, chunks[i].text, Date.now());
        const rowid = result.lastInsertRowid;
        insertVec.run(rowid, Buffer.from(chunks[i].embedding.buffer));
      }
    });

    transaction();
  }

  // Semantic search: find chunks nearest to query embedding
  searchSimilar(
    queryEmbedding: Float32Array,
    limit: number = 10
  ): Array<{ file_path: string; chunk_text: string; distance: number }> {
    const stmt = this.db.prepare(`
      SELECT
        ec.file_path,
        ec.chunk_text,
        ve.distance
      FROM vec_embeddings ve
      JOIN embedding_chunks ec ON ec.rowid = ve.rowid
      WHERE ve.embedding MATCH ?
      ORDER BY ve.distance
      LIMIT ?
    `);

    return stmt.all(
      Buffer.from(queryEmbedding.buffer),
      limit
    ) as Array<{ file_path: string; chunk_text: string; distance: number }>;
  }
}
```

**最佳实践**：
- sqlite-vec 作为可选扩展加载，不可用时优雅降级
- 向量维度应与使用的 embedding 模型匹配（如 OpenAI text-embedding-3-small 为 1536 维）
- 文件更新时先删除旧的 embedding 再插入新的，使用事务保证原子性
- embedding 以 `Float32Array` 传输，存储时转换为 `Buffer`

### 7. 事务管理

better-sqlite3 的事务是同步的，这使得事务管理比异步 API 更直观：

```typescript
// services/DatabaseManager.ts (continued)

export class DatabaseManager {
  // Batch file index update (e.g., after sync)
  batchUpdateFileIndex(files: FileRecord[]): void {
    const upsert = this.db.prepare(`
      INSERT INTO files (path, content_hash, last_modified, size, is_synced, has_conflict)
      VALUES (@path, @content_hash, @last_modified, @size, @is_synced, @has_conflict)
      ON CONFLICT(path) DO UPDATE SET
        content_hash = excluded.content_hash,
        last_modified = excluded.last_modified,
        size = excluded.size,
        is_synced = excluded.is_synced,
        has_conflict = excluded.has_conflict
    `);

    // Wrap in transaction for atomicity and performance
    // Without transaction: each INSERT is a separate transaction (slow)
    // With transaction: all INSERTs share one transaction (fast)
    const batchInsert = this.db.transaction((records: FileRecord[]) => {
      for (const record of records) {
        upsert.run(record);
      }
    });

    batchInsert(files);
  }

  // Transactional file rename (update all references)
  renameFile(oldPath: string, newPath: string): void {
    const transaction = this.db.transaction(() => {
      // Update file record
      this.db
        .prepare('UPDATE files SET path = ? WHERE path = ?')
        .run(newPath, oldPath);

      // Update FTS index
      this.db
        .prepare('UPDATE files_fts SET path = ? WHERE path = ?')
        .run(newPath, oldPath);

      // Update comment references
      this.db
        .prepare('UPDATE comments SET file_path = ? WHERE file_path = ?')
        .run(newPath, oldPath);

      // Update task references
      this.db
        .prepare('UPDATE tasks SET source_file = ? WHERE source_file = ?')
        .run(newPath, oldPath);
    });

    transaction();
  }
}
```

**事务使用要点**：
- 批量写入必须使用事务，性能差距可达 50-100 倍
- better-sqlite3 的事务是同步的，`this.db.transaction()` 返回一个可重用的事务函数
- 涉及多表更新的操作（如文件重命名）使用事务确保一致性
- 事务自动回滚：如果事务函数抛出异常，所有更改自动撤销

### 8. 数据库 Migration

实现可回滚的数据库 schema 迁移：

```typescript
// services/DatabaseMigration.ts

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    up: (db) => {
      // Schema creation already handled in initSchema
      // This migration is a no-op for the initial version
    },
    down: (db) => {
      db.exec(`
        DROP TABLE IF EXISTS ai_messages;
        DROP TABLE IF EXISTS ai_conversations;
        DROP TABLE IF EXISTS tasks;
        DROP TABLE IF EXISTS comments;
        DROP TABLE IF EXISTS files_fts;
        DROP TABLE IF EXISTS files;
        DROP TABLE IF EXISTS user_settings;
      `);
    },
  },
  {
    version: 2,
    description: 'Add file tags support',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_tags (
          file_path TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (file_path, tag),
          FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_tags_tag ON file_tags(tag);
      `);
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS file_tags');
    },
  },
];

export class DatabaseMigration {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureMigrationTable();
  }

  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  getCurrentVersion(): number {
    const row = this.db
      .prepare('SELECT MAX(version) as version FROM schema_migrations')
      .get() as { version: number | null };
    return row?.version ?? 0;
  }

  migrate(): void {
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      return;
    }

    const runMigrations = this.db.transaction(() => {
      for (const migration of pendingMigrations) {
        migration.up(this.db);

        this.db
          .prepare(
            'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
          )
          .run(migration.version, migration.description, Date.now());

        console.log(`Migration ${migration.version}: ${migration.description} - applied`);
      }
    });

    runMigrations();
  }

  rollback(targetVersion: number): void {
    const currentVersion = this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      return;
    }

    const rollbackMigrations = migrations
      .filter((m) => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version); // Reverse order

    const runRollback = this.db.transaction(() => {
      for (const migration of rollbackMigrations) {
        migration.down(this.db);

        this.db
          .prepare('DELETE FROM schema_migrations WHERE version = ?')
          .run(migration.version);

        console.log(`Migration ${migration.version}: ${migration.description} - rolled back`);
      }
    });

    runRollback();
  }
}
```

**最佳实践**：
- 每个 migration 必须包含 `up`（前进）和 `down`（回滚）方法
- 使用事务包裹所有 migration 操作，确保原子性
- 维护 `schema_migrations` 表记录已应用的迁移
- 应用启动时自动执行待应用的 migration

### 9. 性能优化

#### 9.1 索引策略

```sql
-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
  ON tasks(status, priority);

-- Partial index for active items only
CREATE INDEX IF NOT EXISTS idx_comments_open
  ON comments(file_path) WHERE status = 'open';

-- Covering index to avoid table lookup
CREATE INDEX IF NOT EXISTS idx_files_sync_status
  ON files(is_synced, path, content_hash);
```

#### 9.2 查询优化

```typescript
// Use EXPLAIN QUERY PLAN to analyze queries
analyzeQuery(sql: string): string {
  const rows = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
  return rows.map((r: Record<string, unknown>) => String(r.detail)).join('\n');
}

// Example: Check if a query uses the index
const plan = dbManager.analyzeQuery(
  "SELECT * FROM tasks WHERE status = 'todo' AND priority = 'high'"
);
console.log(plan);
// Expected: SEARCH tasks USING INDEX idx_tasks_status_priority (status=? AND priority=?)
```

#### 9.3 缓存策略

| 数据类型 | 缓存位置 | 过期策略 |
|---------|---------|---------|
| 文件内容 | 本地文件系统 | 实时（文件即真相） |
| 文件索引 | SQLite | 文件变更时更新 |
| 语义索引 | 云端 + SQLite 缓存 | Push 后云端更新 |
| 用户配置 | 内存 + SQLite | 启动时加载 |
| AI 对话历史 | SQLite | 永久保存 |

### 10. IPC 集成

在 Electron 主进程中注册数据库相关的 IPC 处理器：

```typescript
// main/ipc/database-handlers.ts
import { ipcMain } from 'electron';
import { DatabaseManager } from '../services/DatabaseManager';
import { SearchService } from '../services/SearchService';

export function registerDatabaseHandlers(
  dbManager: DatabaseManager,
  searchService: SearchService
): void {
  // File search
  ipcMain.handle('db:search', async (_event, query: string, limit?: number) => {
    try {
      return searchService.search({ query, limit });
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  });

  // Get file metadata
  ipcMain.handle('db:getFile', async (_event, filePath: string) => {
    try {
      return dbManager.getFile(filePath);
    } catch (error) {
      console.error('Failed to get file:', error);
      throw error;
    }
  });

  // Get comments for a file
  ipcMain.handle('db:getComments', async (_event, filePath: string) => {
    try {
      return dbManager.getCommentsByFile(filePath);
    } catch (error) {
      console.error('Failed to get comments:', error);
      throw error;
    }
  });

  // Get tasks by status
  ipcMain.handle('db:getTasks', async (_event, status: string) => {
    try {
      return dbManager.getTasksByStatus(status as TaskRecord['status']);
    } catch (error) {
      console.error('Failed to get tasks:', error);
      throw error;
    }
  });

  // Get AI conversation messages
  ipcMain.handle('db:getMessages', async (_event, conversationId: string) => {
    try {
      return dbManager.getConversationMessages(conversationId);
    } catch (error) {
      console.error('Failed to get messages:', error);
      throw error;
    }
  });

  // Get user setting
  ipcMain.handle('db:getSetting', async (_event, key: string) => {
    try {
      return dbManager.getSetting(key);
    } catch (error) {
      console.error('Failed to get setting:', error);
      throw error;
    }
  });

  // Set user setting
  ipcMain.handle('db:setSetting', async (_event, key: string, value: string) => {
    try {
      dbManager.setSetting(key, value);
    } catch (error) {
      console.error('Failed to set setting:', error);
      throw error;
    }
  });
}
```

**最佳实践**：
- 所有数据库操作通过 IPC handler 暴露给渲染进程
- 每个 handler 包含完整的错误处理和日志
- 渲染进程不直接操作数据库（遵循进程隔离原则）
- 使用独立模块注册 IPC handler，保持主进程入口文件简洁

## 与 Sibylla 架构的关系

- **文件即真相**：SQLite 存储索引和元数据，不存储文档原文
- **AI 上下文引擎**：FTS5 全文搜索为 L2 语义相关上下文层提供基础检索能力
- **向量检索**：sqlite-vec 扩展支持 embedding 向量的本地缓存和检索
- **本地优先**：数据库文件随 workspace 存储在本地，离线状态下完全可用
- **Git 同步**：`.sibylla/index.db` 不纳入 Git 版本控制（加入 `.gitignore`），每个客户端独立维护索引

## 与现有 Skills 的关系

- 与 [`electron-desktop-app`](../phase0/electron-desktop-app/SKILL.md) 互补：在 Electron 主进程中运行数据库
- 与 [`electron-ipc-patterns`](../phase0/electron-ipc-patterns/SKILL.md) 互补：通过 IPC 暴露数据库操作
- 与 [`typescript-strict-mode`](../phase0/typescript-strict-mode/SKILL.md) 互补：使用严格类型定义数据库接口
- 与 [`isomorphic-git-integration`](../phase0/isomorphic-git-integration/SKILL.md) 互补：Git 同步后触发索引更新

## 常见问题

### 1. better-sqlite3 原生模块加载失败

**问题**：Electron 打包后 better-sqlite3 无法加载。

**解决方案**：
- 使用 `electron-rebuild` 重新编译原生模块
- 在 `package.json` 的 `build.asarUnpack` 中排除 `better-sqlite3`
- 确保 better-sqlite3 只在主进程中使用

### 2. FTS5 搜索语法错误

**问题**：用户输入特殊字符导致 FTS5 查询失败。

**解决方案**：
- 在执行搜索前对用户输入进行清理（去除 FTS5 特殊操作符）
- 使用 `try/catch` 捕获查询错误并返回空结果
- 对用户输入使用双引号包裹实现精确匹配

### 3. 数据库文件损坏

**问题**：异常关闭导致数据库文件损坏。

**解决方案**：
- WAL 模式本身具有较强的容错能力
- 应用启动时执行 `PRAGMA integrity_check` 检查数据库完整性
- 数据库损坏时自动删除并重建索引（索引数据可从文件系统重新生成）
- 在 `app.on('before-quit')` 中确保正确关闭数据库

## 参考资源

- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3/wiki)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [SQLite FTS5 文档](https://www.sqlite.org/fts5.html)
- [sqlite-vec 文档](https://github.com/asg017/sqlite-vec)
- [SQLite WAL 模式](https://www.sqlite.org/wal.html)
- [SQLite 性能优化](https://www.sqlite.org/lang_explain.html)

## 总结

遵循以下核心原则使用 SQLite 本地存储：

1. **索引而非存储**：SQLite 存储索引和元数据，文档原文存储在文件系统
2. **类型安全**：使用 TypeScript 严格模式定义所有数据库接口
3. **进程隔离**：数据库操作仅在 Electron 主进程，渲染进程通过 IPC 访问
4. **事务优先**：批量操作和多表更新必须使用事务
5. **可回滚 Migration**：每个 schema 变更必须包含 up 和 down 方法
6. **性能意识**：WAL 模式、合理索引、prepared statements、批量操作
7. **优雅降级**：sqlite-vec 等可选扩展不可用时不影响核心功能
