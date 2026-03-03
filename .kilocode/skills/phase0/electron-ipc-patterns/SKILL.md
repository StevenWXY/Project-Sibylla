---
name: electron-ipc-patterns
description: >-
  Electron IPC 通信模式与最佳实践。当需要设计类型安全的 IPC 接口、实现双向通信、处理流式数据传输（大文件、AI streaming）、优化 IPC 性能、或实现错误处理与超时管理时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - electron
    - ipc
    - communication
    - typescript
    - streaming
---

# Electron IPC 通信模式

此 skill 提供 Electron 进程间通信（IPC）的设计模式与最佳实践，涵盖类型安全接口设计、双向通信、流式数据传输、错误处理、性能优化等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 设计类型安全的 IPC 接口（TypeScript）
- 实现双向通信模式（invoke/handle、send/on）
- 处理流式数据传输（AI streaming、大文件上传/下载）
- 实现 IPC 错误处理与超时管理
- 优化 IPC 性能（分片传输、进度回调）
- 设计可扩展的 IPC 架构

## 核心概念

### 1. IPC 通信模式概览

Electron 提供两种主要的 IPC 通信模式：

```
┌─────────────────────────────────────────────────────┐
│              IPC 通信模式                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. 双向通信（Request-Response）                     │
│     渲染进程: ipcRenderer.invoke(channel, ...args)  │
│     主进程:   ipcMain.handle(channel, handler)      │
│     特点:     返回 Promise，支持异步操作              │
│                                                     │
│  2. 单向通信（Fire-and-Forget）                      │
│     渲染进程: ipcRenderer.send(channel, ...args)    │
│     主进程:   ipcMain.on(channel, handler)          │
│     特点:     无返回值，适合通知和流式数据            │
│                                                     │
│  3. 主进程 → 渲染进程推送                            │
│     主进程:   webContents.send(channel, ...args)    │
│     渲染进程: ipcRenderer.on(channel, handler)      │
│     特点:     主进程主动推送数据给渲染进程            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**选择原则**：
- 需要返回值 → 使用 `invoke/handle`
- 流式数据或通知 → 使用 `send/on`
- 主进程推送 → 使用 `webContents.send`

### 2. 类型安全的 IPC 接口设计

使用 TypeScript 定义清晰的 IPC 接口，确保类型安全：

```typescript
// types/ipc.ts
// 定义所有 IPC 通道的类型

// 文件操作
export interface FileReadRequest {
  path: string;
}

export interface FileReadResponse {
  content: string;
  encoding: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}

export interface FileWriteResponse {
  success: boolean;
  bytesWritten: number;
}

// Git 操作
export interface GitStatusResponse {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export interface GitSyncRequest {
  remote?: string;
  branch?: string;
}

export interface GitSyncResponse {
  success: boolean;
  commits: number;
  conflicts: string[];
}

// AI 操作
export interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  error?: string;
}

// IPC 通道名称常量
export const IPC_CHANNELS = {
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_LIST: 'file:list',
  
  GIT_STATUS: 'git:status',
  GIT_SYNC: 'git:sync',
  GIT_HISTORY: 'git:history',
  GIT_DIFF: 'git:diff',
  
  AI_CHAT: 'ai:chat',
  AI_EMBED: 'ai:embed',
  AI_SEARCH: 'ai:search',
  
  SEARCH_LOCAL: 'search:local',
  SEARCH_SEMANTIC: 'search:semantic',
} as const;

// 类型安全的 IPC 接口定义
export interface IPCInterface {
  // 文件操作
  [IPC_CHANNELS.FILE_READ]: (req: FileReadRequest) => Promise<FileReadResponse>;
  [IPC_CHANNELS.FILE_WRITE]: (req: FileWriteRequest) => Promise<FileWriteResponse>;
  [IPC_CHANNELS.FILE_DELETE]: (path: string) => Promise<void>;
  [IPC_CHANNELS.FILE_LIST]: (dirPath: string) => Promise<string[]>;
  
  // Git 操作
  [IPC_CHANNELS.GIT_STATUS]: () => Promise<GitStatusResponse>;
  [IPC_CHANNELS.GIT_SYNC]: (req: GitSyncRequest) => Promise<GitSyncResponse>;
  
  // AI 操作（流式）
  [IPC_CHANNELS.AI_CHAT]: (req: ChatRequest) => AsyncIterable<ChatChunk>;
}
```

**最佳实践**：
- 为每个 IPC 通道定义清晰的请求和响应类型
- 使用常量定义通道名称，避免硬编码字符串
- 使用 `as const` 确保通道名称的类型推断
- 为流式 API 使用 `AsyncIterable` 类型

### 3. Preload 脚本中的类型安全实现

在 preload 脚本中实现类型安全的 API 暴露：

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IPCInterface, ChatRequest, ChatChunk } from './types/ipc';
import { IPC_CHANNELS } from './types/ipc';

// 实现类型安全的 API
const electronAPI: IPCInterface = {
  // 文件操作
  [IPC_CHANNELS.FILE_READ]: (req) => 
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, req),
  
  [IPC_CHANNELS.FILE_WRITE]: (req) => 
    ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, req),
  
  [IPC_CHANNELS.FILE_DELETE]: (path) => 
    ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, path),
  
  [IPC_CHANNELS.FILE_LIST]: (dirPath) => 
    ipcRenderer.invoke(IPC_CHANNELS.FILE_LIST, dirPath),
  
  // Git 操作
  [IPC_CHANNELS.GIT_STATUS]: () => 
    ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS),
  
  [IPC_CHANNELS.GIT_SYNC]: (req) => 
    ipcRenderer.invoke(IPC_CHANNELS.GIT_SYNC, req),
  
  // AI 流式操作
  [IPC_CHANNELS.AI_CHAT]: async function* (req: ChatRequest) {
    const channel = `${IPC_CHANNELS.AI_CHAT}:${Date.now()}`;
    
    // 发送请求
    ipcRenderer.send(IPC_CHANNELS.AI_CHAT, channel, req);
    
    // 监听流式响应
    while (true) {
      const chunk: ChatChunk = await new Promise((resolve) => {
        ipcRenderer.once(channel, (_, data) => resolve(data));
      });
      
      if (chunk.error) {
        throw new Error(chunk.error);
      }
      
      if (chunk.done) {
        break;
      }
      
      yield chunk;
    }
  },
};

// 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 类型声明
declare global {
  interface Window {
    electronAPI: IPCInterface;
  }
}
```

**最佳实践**：
- 使用接口类型约束 API 实现
- 为流式 API 使用 `async function*` 生成器
- 为每个流式请求生成唯一的通道 ID（避免冲突）
- 在 preload 中处理流式响应的生命周期管理

### 4. 主进程中的 IPC 处理器

在主进程中实现类型安全的 IPC 处理器：

```typescript
// main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import type { 
  FileReadRequest, 
  FileReadResponse,
  FileWriteRequest,
  FileWriteResponse,
  GitStatusResponse,
  GitSyncRequest,
  GitSyncResponse,
  ChatRequest,
  ChatChunk,
} from './types/ipc';
import { IPC_CHANNELS } from './types/ipc';
import { FileManager } from './services/FileManager';
import { GitAbstraction } from './services/GitAbstraction';
import { AIGateway } from './services/AIGateway';

// 注册文件操作处理器
ipcMain.handle(
  IPC_CHANNELS.FILE_READ,
  async (event, req: FileReadRequest): Promise<FileReadResponse> => {
    try {
      const content = await FileManager.read(req.path);
      return {
        content,
        encoding: 'utf-8',
      };
    } catch (error) {
      console.error('Failed to read file:', error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
);

ipcMain.handle(
  IPC_CHANNELS.FILE_WRITE,
  async (event, req: FileWriteRequest): Promise<FileWriteResponse> => {
    try {
      const bytesWritten = await FileManager.write(req.path, req.content);
      
      // 自动提交到 Git
      await GitAbstraction.autoCommit(req.path, 'Update file');
      
      return {
        success: true,
        bytesWritten,
      };
    } catch (error) {
      console.error('Failed to write file:', error);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }
);

// 注册 Git 操作处理器
ipcMain.handle(
  IPC_CHANNELS.GIT_STATUS,
  async (): Promise<GitStatusResponse> => {
    return await GitAbstraction.getStatus();
  }
);

ipcMain.handle(
  IPC_CHANNELS.GIT_SYNC,
  async (event, req: GitSyncRequest): Promise<GitSyncResponse> => {
    try {
      const result = await GitAbstraction.sync(req.remote, req.branch);
      return result;
    } catch (error) {
      console.error('Git sync failed:', error);
      throw new Error(`Git sync failed: ${error.message}`);
    }
  }
);

// 注册 AI 流式处理器
ipcMain.on(
  IPC_CHANNELS.AI_CHAT,
  async (event, channel: string, req: ChatRequest) => {
    try {
      const stream = await AIGateway.chat(req);
      
      for await (const delta of stream) {
        const chunk: ChatChunk = {
          delta,
          done: false,
        };
        event.sender.send(channel, chunk);
      }
      
      // 发送结束标记
      event.sender.send(channel, { delta: '', done: true });
    } catch (error) {
      console.error('AI chat error:', error);
      event.sender.send(channel, {
        delta: '',
        done: true,
        error: error.message,
      });
    }
  }
);
```

**最佳实践**：
- 为每个处理器添加明确的类型注解
- 在处理器中进行完整的错误处理
- 将业务逻辑封装在独立的服务类中
- 对于流式数据，使用 `ipcMain.on` 而非 `ipcMain.handle`
- 始终发送结束标记（`done: true`）以通知流结束

### 5. 流式数据传输模式

处理大文件或 AI streaming 等流式数据：

#### 5.1 AI Streaming 模式

```typescript
// services/AIGateway.ts
import Anthropic from '@anthropic-ai/sdk';

export class AIGateway {
  private client: Anthropic;
  
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  
  async *chat(request: ChatRequest): AsyncIterable<string> {
    const stream = await this.client.messages.create({
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      stream: true,
    });
    
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }
  }
}
```

#### 5.2 大文件分片传输模式

```typescript
// 大文件上传（渲染进程 → 主进程）
export interface FileUploadChunk {
  id: string;
  index: number;
  total: number;
  data: string; // Base64 编码
  done: boolean;
}

// Preload 脚本
async function uploadLargeFile(filePath: string, chunkSize = 1024 * 1024) {
  const file = await fs.promises.readFile(filePath);
  const totalChunks = Math.ceil(file.length / chunkSize);
  const uploadId = Date.now().toString();
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.length);
    const chunk = file.slice(start, end);
    
    const uploadChunk: FileUploadChunk = {
      id: uploadId,
      index: i,
      total: totalChunks,
      data: chunk.toString('base64'),
      done: i === totalChunks - 1,
    };
    
    await ipcRenderer.invoke('file:upload:chunk', uploadChunk);
  }
}

// 主进程处理器
const uploadBuffers = new Map<string, Buffer[]>();

ipcMain.handle('file:upload:chunk', async (event, chunk: FileUploadChunk) => {
  if (!uploadBuffers.has(chunk.id)) {
    uploadBuffers.set(chunk.id, []);
  }
  
  const buffers = uploadBuffers.get(chunk.id)!;
  buffers[chunk.index] = Buffer.from(chunk.data, 'base64');
  
  if (chunk.done) {
    // 合并所有分片
    const completeFile = Buffer.concat(buffers);
    uploadBuffers.delete(chunk.id);
    
    // 保存文件
    await fs.promises.writeFile('/path/to/save', completeFile);
    
    return { success: true, size: completeFile.length };
  }
  
  return { success: true, progress: (chunk.index + 1) / chunk.total };
});
```

**最佳实践**：
- 对于大文件，使用分片传输避免内存溢出
- 每个分片包含索引和总数，便于进度跟踪
- 使用唯一 ID 标识上传会话
- 在主进程中缓存分片，完成后合并
- 提供进度回调给渲染进程

### 6. 错误处理与超时管理

实现健壮的错误处理和超时机制：

```typescript
// utils/ipc-helpers.ts

// 带超时的 IPC 调用
export async function invokeWithTimeout<T>(
  channel: string,
  timeout: number,
  ...args: any[]
): Promise<T> {
  return Promise.race([
    ipcRenderer.invoke(channel, ...args),
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`IPC timeout: ${channel}`)), timeout)
    ),
  ]);
}

// 带重试的 IPC 调用
export async function invokeWithRetry<T>(
  channel: string,
  maxRetries: number,
  retryDelay: number,
  ...args: any[]
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ipcRenderer.invoke(channel, ...args);
    } catch (error) {
      lastError = error;
      console.warn(`IPC retry ${i + 1}/${maxRetries} for ${channel}:`, error);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  throw lastError!;
}

// 在渲染进程中使用
try {
  const result = await invokeWithTimeout<FileReadResponse>(
    IPC_CHANNELS.FILE_READ,
    5000, // 5 秒超时
    { path: '/path/to/file' }
  );
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('IPC 调用超时');
  } else {
    console.error('IPC 调用失败:', error);
  }
}

// 主进程错误处理
ipcMain.handle(IPC_CHANNELS.FILE_READ, async (event, req: FileReadRequest) => {
  // 参数验证
  if (!req.path || typeof req.path !== 'string') {
    throw new Error('Invalid file path');
  }
  
  // 路径安全检查
  if (req.path.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
  
  try {
    const content = await FileManager.read(req.path);
    return { content, encoding: 'utf-8' };
  } catch (error) {
    // 区分不同类型的错误
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${req.path}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${req.path}`);
    } else {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
});
```

**最佳实践**：
- 为长时间运行的操作设置超时
- 实现重试机制处理临时性错误
- 在主进程中进行参数验证和安全检查
- 区分不同类型的错误，提供清晰的错误信息
- 避免暴露敏感的系统错误信息给渲染进程

### 7. IPC 性能优化

优化 IPC 通信性能：

#### 7.1 批量操作

```typescript
// 不推荐：逐个文件读取
for (const path of filePaths) {
  const content = await window.electronAPI['file:read']({ path });
  // 处理内容
}

// 推荐：批量读取
export interface FileBatchReadRequest {
  paths: string[];
}

export interface FileBatchReadResponse {
  files: Array<{ path: string; content: string; error?: string }>;
}

// Preload
'file:batchRead': (req: FileBatchReadRequest) => 
  ipcRenderer.invoke('file:batchRead', req),

// 主进程
ipcMain.handle('file:batchRead', async (event, req: FileBatchReadRequest) => {
  const results = await Promise.allSettled(
    req.paths.map(path => FileManager.read(path))
  );
  
  return {
    files: results.map((result, index) => ({
      path: req.paths[index],
      content: result.status === 'fulfilled' ? result.value : '',
      error: result.status === 'rejected' ? result.reason.message : undefined,
    })),
  };
});
```

#### 7.2 数据压缩

```typescript
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 主进程：压缩大数据
ipcMain.handle('file:read:large', async (event, req: FileReadRequest) => {
  const content = await FileManager.read(req.path);
  
  // 如果内容超过 100KB，进行压缩
  if (content.length > 100 * 1024) {
    const compressed = await gzip(Buffer.from(content));
    return {
      content: compressed.toString('base64'),
      encoding: 'utf-8',
      compressed: true,
    };
  }
  
  return { content, encoding: 'utf-8', compressed: false };
});

// Preload：解压数据
'file:read:large': async (req: FileReadRequest) => {
  const response = await ipcRenderer.invoke('file:read:large', req);
  
  if (response.compressed) {
    const buffer = Buffer.from(response.content, 'base64');
    const decompressed = await gunzip(buffer);
    return {
      content: decompressed.toString('utf-8'),
      encoding: response.encoding,
    };
  }
  
  return response;
},
```

#### 7.3 缓存策略

```typescript
// 渲染进程缓存
class IPCCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 60000; // 1 分钟
  
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = this.ttl
  ): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    
    return data;
  }
  
  invalidate(key: string) {
    this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
}

// 使用缓存
const ipcCache = new IPCCache();

async function getGitStatus() {
  return ipcCache.get(
    'git:status',
    () => window.electronAPI['git:status'](),
    5000 // 5 秒缓存
  );
}

// 文件写入后使缓存失效
async function writeFile(path: string, content: string) {
  await window.electronAPI['file:write']({ path, content });
  ipcCache.invalidate('git:status');
}
```

**最佳实践**：
- 批量操作减少 IPC 往返次数
- 对大数据进行压缩传输
- 在渲染进程中缓存频繁访问的数据
- 在数据变更后及时使缓存失效
- 监控 IPC 调用频率，识别性能瓶颈

### 8. 可扩展的 IPC 架构

设计可扩展的 IPC 架构：

```typescript
// ipc/registry.ts
type IPCHandler<TRequest, TResponse> = (
  event: Electron.IpcMainInvokeEvent,
  request: TRequest
) => Promise<TResponse>;

class IPCRegistry {
  private handlers = new Map<string, IPCHandler<any, any>>();
  
  register<TRequest, TResponse>(
    channel: string,
    handler: IPCHandler<TRequest, TResponse>
  ) {
    if (this.handlers.has(channel)) {
      throw new Error(`IPC handler already registered: ${channel}`);
    }
    
    this.handlers.set(channel, handler);
    
    ipcMain.handle(channel, async (event, request) => {
      try {
        return await handler(event, request);
      } catch (error) {
        console.error(`IPC handler error [${channel}]:`, error);
        throw error;
      }
    });
  }
  
  unregister(channel: string) {
    this.handlers.delete(channel);
    ipcMain.removeHandler(channel);
  }
  
  listChannels(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const ipcRegistry = new IPCRegistry();

// 使用注册表
import { ipcRegistry } from './ipc/registry';
import { FileHandlers } from './ipc/handlers/file';
import { GitHandlers } from './ipc/handlers/git';
import { AIHandlers } from './ipc/handlers/ai';

// 注册所有处理器
FileHandlers.register(ipcRegistry);
GitHandlers.register(ipcRegistry);
AIHandlers.register(ipcRegistry);

// ipc/handlers/file.ts
export class FileHandlers {
  static register(registry: IPCRegistry) {
    registry.register(IPC_CHANNELS.FILE_READ, this.handleRead);
    registry.register(IPC_CHANNELS.FILE_WRITE, this.handleWrite);
    registry.register(IPC_CHANNELS.FILE_DELETE, this.handleDelete);
  }
  
  private static async handleRead(
    event: Electron.IpcMainInvokeEvent,
    req: FileReadRequest
  ): Promise<FileReadResponse> {
    const content = await FileManager.read(req.path);
    return { content, encoding: 'utf-8' };
  }
  
  private static async handleWrite(
    event: Electron.IpcMainInvokeEvent,
    req: FileWriteRequest
  ): Promise<FileWriteResponse> {
    const bytesWritten = await FileManager.write(req.path, req.content);
    await GitAbstraction.autoCommit(req.path, 'Update file');
    return { success: true, bytesWritten };
  }
  
  private static async handleDelete(
    event: Electron.IpcMainInvokeEvent,
    path: string
  ): Promise<void> {
    await FileManager.delete(path);
    await GitAbstraction.autoCommit(path, 'Delete file');
  }
}
```

**最佳实践**：
- 使用注册表统一管理 IPC 处理器
- 按功能模块组织处理器（文件、Git、AI 等）
- 在注册表中统一处理错误和日志
- 支持动态注册和注销处理器
- 提供处理器列表用于调试和监控

## 常见问题

### 1. 流式响应中断

**问题**：AI streaming 过程中渲染进程刷新导致流中断。

**解决方案**：
- 在主进程中缓存流状态
- 渲染进程重新连接时恢复流
- 使用持久化的通道 ID

### 2. IPC 调用超时

**问题**：长时间运行的操作导致渲染进程无响应。

**解决方案**：
- 使用 `send/on` 模式进行异步通知
- 在主进程中使用 Worker 线程处理耗时操作
- 提供进度回调给渲染进程

### 3. 内存泄漏

**问题**：频繁的 IPC 调用导致内存泄漏。

**解决方案**：
- 及时移除事件监听器（使用 `once` 而非 `on`）
- 清理主进程中的缓存数据
- 使用 WeakMap 存储临时数据

## 参考资源

- [Electron IPC 官方文档](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge)
- [ipcMain API](https://www.electronjs.org/docs/latest/api/ipc-main)
- [ipcRenderer API](https://www.electronjs.org/docs/latest/api/ipc-renderer)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)

## 总结

遵循以下核心原则设计 IPC 通信：

1. **类型安全**：使用 TypeScript 定义清晰的接口
2. **模式选择**：根据场景选择合适的通信模式
3. **错误处理**：实现完整的错误处理和超时机制
4. **性能优化**：批量操作、压缩、缓存
5. **流式传输**：正确处理 AI streaming 和大文件传输
6. **可扩展性**：使用注册表管理处理器
7. **安全性**：参数验证、路径检查、权限控制
