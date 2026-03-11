# 文件管理器实现

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK008 |
| **任务标题** | 文件管理器实现 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Sibylla 的文件管理器模块，提供安全、高效的文件系统操作接口，支持文件读写、目录遍历、文件监控等核心功能，为上层编辑器和 Git 抽象层提供统一的文件访问能力。

### 背景

根据 [`CLAUDE.md`](../../../CLAUDE.md) 的"文件即真相"设计哲学，Sibylla 的所有用户内容必须以明文文件形式存储在本地文件系统中。文件管理器是实现这一理念的基础模块，需要确保文件操作的安全性、原子性和可靠性。

本任务是 Phase 0 第三组任务的起点，为后续的 Workspace 初始化和 Git 集成奠定基础。

### 范围

**包含：**
- 文件读写操作（支持 Markdown、JSON、CSV 等文本格式）
- 目录遍历和文件列表
- 文件元信息查询（大小、修改时间、权限等）
- 原子写入机制（临时文件 + 原子替换）
- 路径安全验证（防止路径遍历攻击）
- 文件监控（watch）机制
- IPC 接口暴露给渲染进程

**不包含：**
- Workspace 创建逻辑（TASK009）
- Git 操作（TASK010）
- 文件搜索功能（Phase 1）
- 大文件处理优化（Phase 1）

## 技术要求

### 技术栈

- **Node.js fs/promises:** 异步文件系统 API
- **chokidar:** ^3.5.0（文件监控）
- **path:** Node.js 内置（路径处理）
- **iconv-lite:** ^0.6.0（编码转换，可选）

### 架构设计

```
src/main/services/
├── file-manager.ts          # 文件管理器主类
├── file-watcher.ts          # 文件监控服务
└── types/
    └── file-manager.types.ts # 类型定义

src/main/ipc/handlers/
└── file.handler.ts          # 文件操作 IPC 处理器
```

**核心接口定义：**

```typescript
// src/main/services/types/file-manager.types.ts

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedTime: Date
  createdTime: Date
  extension?: string
}

export interface FileContent {
  path: string
  content: string
  encoding: string
  size: number
}

export interface WriteFileOptions {
  encoding?: BufferEncoding
  atomic?: boolean
  createDirs?: boolean
}

export interface ReadFileOptions {
  encoding?: BufferEncoding
  maxSize?: number
}

export interface ListFilesOptions {
  recursive?: boolean
  includeHidden?: boolean
  filter?: (file: FileInfo) => boolean
}

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  stats?: FileInfo
}
```

**FileManager 类接口：**

```typescript
// src/main/services/file-manager.ts

export class FileManager {
  private workspaceRoot: string
  private watcher: FileWatcher | null = null
  
  constructor(workspaceRoot: string)
  
  // 文件读写
  async readFile(relativePath: string, options?: ReadFileOptions): Promise<FileContent>
  async writeFile(relativePath: string, content: string, options?: WriteFileOptions): Promise<void>
  async deleteFile(relativePath: string): Promise<void>
  async copyFile(sourcePath: string, destPath: string): Promise<void>
  async moveFile(sourcePath: string, destPath: string): Promise<void>
  
  // 目录操作
  async createDirectory(relativePath: string, recursive?: boolean): Promise<void>
  async deleteDirectory(relativePath: string, recursive?: boolean): Promise<void>
  async listFiles(relativePath: string, options?: ListFilesOptions): Promise<FileInfo[]>
  
  // 文件信息
  async getFileInfo(relativePath: string): Promise<FileInfo>
  async exists(relativePath: string): Promise<boolean>
  
  // 文件监控
  async startWatching(callback: (event: FileWatchEvent) => void): Promise<void>
  async stopWatching(): Promise<void>
  
  // 工具方法
  resolvePath(relativePath: string): string
  validatePath(fullPath: string): void
  getRelativePath(fullPath: string): string
}
```

### 实现细节

#### 关键实现点

1. **原子写入机制**
   ```typescript
   async writeFile(relativePath: string, content: string, options?: WriteFileOptions): Promise<void> {
     const fullPath = this.resolvePath(relativePath)
     this.validatePath(fullPath)
     
     const opts = {
       encoding: options?.encoding || 'utf-8',
       atomic: options?.atomic !== false, // 默认启用原子写入
       createDirs: options?.createDirs !== false
     }
     
     // 确保父目录存在
     if (opts.createDirs) {
       const dir = path.dirname(fullPath)
       await fs.mkdir(dir, { recursive: true })
     }
     
     if (opts.atomic) {
       // 原子写入：先写临时文件，再原子替换
       const tempPath = `${fullPath}.tmp.${Date.now()}`
       try {
         await fs.writeFile(tempPath, content, opts.encoding)
         await fs.rename(tempPath, fullPath)
       } catch (error) {
         // 清理临时文件
         await fs.unlink(tempPath).catch(() => {})
         throw error
       }
     } else {
       // 直接写入
       await fs.writeFile(fullPath, content, opts.encoding)
     }
     
     console.log(`[FileManager] File written: ${relativePath}`)
   }
   ```

2. **路径安全验证**
   ```typescript
   validatePath(fullPath: string): void {
     // 1. 防止路径遍历攻击
     const normalized = path.normalize(fullPath)
     if (!normalized.startsWith(this.workspaceRoot)) {
       throw new FileManagerError(
         'PATH_OUTSIDE_WORKSPACE',
         `Path outside workspace: ${fullPath}`
       )
     }
     
     // 2. 禁止访问系统目录
     const forbidden = ['.git', 'node_modules', '.sibylla/index']
     const relativePath = path.relative(this.workspaceRoot, normalized)
     
     for (const dir of forbidden) {
       if (relativePath.startsWith(dir) || relativePath.includes(`/${dir}/`)) {
         throw new FileManagerError(
           'ACCESS_FORBIDDEN',
           `Access to system directory forbidden: ${dir}`
         )
       }
     }
     
     // 3. 检查路径长度（Windows 限制）
     if (process.platform === 'win32' && fullPath.length > 260) {
       throw new FileManagerError(
         'PATH_TOO_LONG',
         'Path exceeds Windows MAX_PATH limit'
       )
     }
   }
   ```

3. **文件读取与编码处理**
   ```typescript
   async readFile(relativePath: string, options?: ReadFileOptions): Promise<FileContent> {
     const fullPath = this.resolvePath(relativePath)
     this.validatePath(fullPath)
     
     const opts = {
       encoding: options?.encoding || 'utf-8',
       maxSize: options?.maxSize || 10 * 1024 * 1024 // 默认 10MB
     }
     
     // 检查文件大小
     const stats = await fs.stat(fullPath)
     if (stats.size > opts.maxSize) {
       throw new FileManagerError(
         'FILE_TOO_LARGE',
         `File size ${stats.size} exceeds limit ${opts.maxSize}`
       )
     }
     
     // 读取文件
     const content = await fs.readFile(fullPath, opts.encoding as BufferEncoding)
     
     return {
       path: relativePath,
       content,
       encoding: opts.encoding,
       size: stats.size
     }
   }
   ```

4. **目录遍历**
   ```typescript
   async listFiles(relativePath: string, options?: ListFilesOptions): Promise<FileInfo[]> {
     const fullPath = this.resolvePath(relativePath)
     this.validatePath(fullPath)
     
     const opts = {
       recursive: options?.recursive || false,
       includeHidden: options?.includeHidden || false,
       filter: options?.filter
     }
     
     const results: FileInfo[] = []
     
     async function traverse(dirPath: string, baseRelPath: string) {
       const entries = await fs.readdir(dirPath, { withFileTypes: true })
       
       for (const entry of entries) {
         // 跳过隐藏文件
         if (!opts.includeHidden && entry.name.startsWith('.')) {
           continue
         }
         
         const entryFullPath = path.join(dirPath, entry.name)
         const entryRelPath = path.join(baseRelPath, entry.name)
         const stats = await fs.stat(entryFullPath)
         
         const fileInfo: FileInfo = {
           name: entry.name,
           path: entryRelPath,
           isDirectory: entry.isDirectory(),
           size: stats.size,
           modifiedTime: stats.mtime,
           createdTime: stats.birthtime,
           extension: entry.isFile() ? path.extname(entry.name) : undefined
         }
         
         // 应用过滤器
         if (!opts.filter || opts.filter(fileInfo)) {
           results.push(fileInfo)
         }
         
         // 递归遍历子目录
         if (opts.recursive && entry.isDirectory()) {
           await traverse(entryFullPath, entryRelPath)
         }
       }
     }
     
     await traverse(fullPath, relativePath)
     return results
   }
   ```

5. **文件监控**
   ```typescript
   // src/main/services/file-watcher.ts
   import chokidar from 'chokidar'
   
   export class FileWatcher {
     private watcher: chokidar.FSWatcher | null = null
     private workspaceRoot: string
     
     constructor(workspaceRoot: string) {
       this.workspaceRoot = workspaceRoot
     }
     
     async start(callback: (event: FileWatchEvent) => void): Promise<void> {
       if (this.watcher) {
         throw new Error('Watcher already started')
       }
       
       this.watcher = chokidar.watch(this.workspaceRoot, {
         ignored: [
           /(^|[\/\\])\../, // 隐藏文件
           '**/node_modules/**',
           '**/.git/**',
           '**/.sibylla/index/**'
         ],
         persistent: true,
         ignoreInitial: true,
         awaitWriteFinish: {
           stabilityThreshold: 300,
           pollInterval: 100
         }
       })
       
       this.watcher
         .on('add', (filePath, stats) => {
           callback({
             type: 'add',
             path: path.relative(this.workspaceRoot, filePath),
             stats: this.statsToFileInfo(filePath, stats)
           })
         })
         .on('change', (filePath, stats) => {
           callback({
             type: 'change',
             path: path.relative(this.workspaceRoot, filePath),
             stats: this.statsToFileInfo(filePath, stats)
           })
         })
         .on('unlink', (filePath) => {
           callback({
             type: 'unlink',
             path: path.relative(this.workspaceRoot, filePath)
           })
         })
         .on('addDir', (dirPath) => {
           callback({
             type: 'addDir',
             path: path.relative(this.workspaceRoot, dirPath)
           })
         })
         .on('unlinkDir', (dirPath) => {
           callback({
             type: 'unlinkDir',
             path: path.relative(this.workspaceRoot, dirPath)
           })
         })
       
       console.log('[FileWatcher] Started watching:', this.workspaceRoot)
     }
     
     async stop(): Promise<void> {
       if (this.watcher) {
         await this.watcher.close()
         this.watcher = null
         console.log('[FileWatcher] Stopped watching')
       }
     }
     
     private statsToFileInfo(filePath: string, stats: any): FileInfo {
       return {
         name: path.basename(filePath),
         path: path.relative(this.workspaceRoot, filePath),
         isDirectory: stats.isDirectory(),
         size: stats.size,
         modifiedTime: stats.mtime,
         createdTime: stats.birthtime,
         extension: path.extname(filePath)
       }
     }
   }
   ```

6. **IPC 处理器**
   ```typescript
   // src/main/ipc/handlers/file.handler.ts
   import { ipcMain, IpcMainInvokeEvent } from 'electron'
   import { IpcHandler } from '../handler'
   import { FileManager } from '../../services/file-manager'
   import { IPC_CHANNELS } from '../../../shared/ipc-channels'
   
   export class FileHandler extends IpcHandler {
     readonly namespace = 'file'
     private fileManager: FileManager | null = null
     
     register(): void {
       // 读取文件
       ipcMain.handle(
         IPC_CHANNELS.FILE_READ,
         this.safeHandle(this.readFile.bind(this))
       )
       
       // 写入文件
       ipcMain.handle(
         IPC_CHANNELS.FILE_WRITE,
         this.safeHandle(this.writeFile.bind(this))
       )
       
       // 列出文件
       ipcMain.handle(
         IPC_CHANNELS.FILE_LIST,
         this.safeHandle(this.listFiles.bind(this))
       )
       
       // 删除文件
       ipcMain.handle(
         IPC_CHANNELS.FILE_DELETE,
         this.safeHandle(this.deleteFile.bind(this))
       )
       
       // 获取文件信息
       ipcMain.handle(
         IPC_CHANNELS.FILE_INFO,
         this.safeHandle(this.getFileInfo.bind(this))
       )
     }
     
     setFileManager(fileManager: FileManager): void {
       this.fileManager = fileManager
     }
     
     private async readFile(_event: IpcMainInvokeEvent, relativePath: string) {
       if (!this.fileManager) {
         throw new Error('FileManager not initialized')
       }
       return await this.fileManager.readFile(relativePath)
     }
     
     private async writeFile(
       _event: IpcMainInvokeEvent,
       relativePath: string,
       content: string,
       options?: any
     ) {
       if (!this.fileManager) {
         throw new Error('FileManager not initialized')
       }
       await this.fileManager.writeFile(relativePath, content, options)
       return { success: true }
     }
     
     private async listFiles(
       _event: IpcMainInvokeEvent,
       relativePath: string,
       options?: any
     ) {
       if (!this.fileManager) {
         throw new Error('FileManager not initialized')
       }
       return await this.fileManager.listFiles(relativePath, options)
     }
     
     private async deleteFile(_event: IpcMainInvokeEvent, relativePath: string) {
       if (!this.fileManager) {
         throw new Error('FileManager not initialized')
       }
       await this.fileManager.deleteFile(relativePath)
       return { success: true }
     }
     
     private async getFileInfo(_event: IpcMainInvokeEvent, relativePath: string) {
       if (!this.fileManager) {
         throw new Error('FileManager not initialized')
       }
       return await this.fileManager.getFileInfo(relativePath)
     }
   }
   ```

7. **错误处理**
   ```typescript
   // src/main/services/types/file-manager.types.ts
   
   export class FileManagerError extends Error {
     constructor(
       public code: string,
       message: string,
       public details?: any
     ) {
       super(message)
       this.name = 'FileManagerError'
     }
   }
   
   export const FILE_ERROR_CODES = {
     PATH_OUTSIDE_WORKSPACE: 'PATH_OUTSIDE_WORKSPACE',
     ACCESS_FORBIDDEN: 'ACCESS_FORBIDDEN',
     PATH_TOO_LONG: 'PATH_TOO_LONG',
     FILE_NOT_FOUND: 'FILE_NOT_FOUND',
     FILE_TOO_LARGE: 'FILE_TOO_LARGE',
     PERMISSION_DENIED: 'PERMISSION_DENIED',
     DISK_FULL: 'DISK_FULL',
     INVALID_ENCODING: 'INVALID_ENCODING'
   } as const
   ```

### 数据模型

数据模型已在架构设计部分的类型定义中说明（[`FileInfo`](file-manager.types.ts:3)、[`FileContent`](file-manager.types.ts:12)、[`FileWatchEvent`](file-manager.types.ts:35) 等）。

### API 规范

**IPC 通道定义：**

```typescript
// src/shared/ipc-channels.ts (追加)

export const IPC_CHANNELS = {
  // ... 现有通道
  
  // 文件操作
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_COPY: 'file:copy',
  FILE_MOVE: 'file:move',
  FILE_LIST: 'file:list',
  FILE_INFO: 'file:info',
  FILE_EXISTS: 'file:exists',
  
  // 目录操作
  DIR_CREATE: 'dir:create',
  DIR_DELETE: 'dir:delete',
  
  // 文件监控
  FILE_WATCH_START: 'file:watch:start',
  FILE_WATCH_STOP: 'file:watch:stop',
  FILE_WATCH_EVENT: 'file:watch:event'
} as const
```

**渲染进程调用示例：**

```typescript
// 读取文件
const fileContent = await window.api.invoke('file:read', 'README.md')

// 写入文件
await window.api.invoke('file:write', 'docs/new-doc.md', '# New Document', {
  atomic: true,
  createDirs: true
})

// 列出文件
const files = await window.api.invoke('file:list', 'docs', {
  recursive: true,
  filter: (file) => file.extension === '.md'
})

// 监听文件变化
const unsubscribe = window.api.on('file:watch:event', (event) => {
  console.log('File changed:', event)
})
```

## 验收标准

### 功能完整性

- [ ] 能够读取文本文件（< 10MB）并返回内容
- [ ] 能够写入文件，使用原子写入机制
- [ ] 能够列出目录中的文件和子目录
- [ ] 能够递归遍历目录树
- [ ] 能够获取文件元信息（大小、修改时间等）
- [ ] 能够删除文件和目录
- [ ] 能够监控文件变化并触发回调
- [ ] 路径验证能够阻止路径遍历攻击
- [ ] 路径验证能够阻止访问系统目录（.git、node_modules 等）

### 性能指标

- [ ] 读取 1MB 文件 < 100ms
- [ ] 写入 1MB 文件 < 200ms
- [ ] 列出 100 个文件的目录 < 50ms
- [ ] 递归列出 1000 个文件 < 500ms
- [ ] 文件监控事件延迟 < 500ms

### 用户体验

- [ ] 文件操作失败时有清晰的错误信息
- [ ] 大文件操作不阻塞主线程
- [ ] 文件监控不影响系统性能

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共方法有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **文件读取测试**
   - 输入：存在的文件路径
   - 预期输出：文件内容和元信息
   - 边界条件：不存在的文件、权限不足、文件过大

2. **原子写入测试**
   - 输入：文件路径和内容
   - 预期输出：文件成功写入，原文件未损坏
   - 边界条件：写入失败时临时文件被清理

3. **路径验证测试**
   - 输入：各种路径（正常、遍历攻击、系统目录）
   - 预期输出：合法路径通过，非法路径抛出错误
   - 边界条件：边界路径、符号链接

4. **目录遍历测试**
   - 输入：目录路径和选项
   - 预期输出：文件列表
   - 边界条件：空目录、深层嵌套、大量文件

5. **文件监控测试**
   - 输入：启动监控
   - 预期输出：文件变化时触发回调
   - 边界条件：快速连续变化、监控停止

### 集成测试

**测试场景：**

1. IPC 通信测试
   - 渲染进程调用文件操作 IPC
   - 验证主进程正确处理并返回结果

2. 文件监控集成测试
   - 启动监控
   - 修改文件
   - 验证渲染进程收到事件通知

### 端到端测试

暂不要求 E2E 测试，将在 TASK013 集成测试阶段补充。

## 依赖关系

### 前置依赖

- [x] [TASK003](phase0-task003_ui-framework.md) - 基础 UI 框架集成（IPC 框架已就绪）

### 被依赖任务

- [TASK009](phase0-task009_workspace-initialization.md) - Workspace 创建与初始化
- [TASK010](phase0-task010_git-abstraction-basic.md) - Git 抽象层基础实现
- Phase 1 编辑器功能

### 阻塞风险

- 文件系统权限问题（特别是 Windows）
- 大文件处理性能问题
- 文件监控在某些文件系统上的兼容性问题

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Windows 路径长度限制 | 中 | 中 | 检测路径长度，提供清晰错误信息 |
| 文件编码问题 | 中 | 低 | 默认 UTF-8，提供编码检测和转换 |
| 文件监控性能影响 | 低 | 中 | 使用 chokidar 的防抖机制，忽略不必要的文件 |
| 原子写入失败 | 高 | 低 | 完善错误处理，确保临时文件清理 |

### 时间风险

- 文件监控功能可能需要额外调试时间
- 跨平台测试需要 Mac 和 Windows 环境

### 资源风险

- 需要 Mac 和 Windows 测试环境
- 需要测试大量文件场景

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/requirements/phase0/file-system-git-basic.md`](../../requirements/phase0/file-system-git-basic.md) - 文件系统需求
- [Node.js fs/promises 文档](https://nodejs.org/api/fs.html#promises-api)
- [chokidar 文档](https://github.com/paulmillr/chokidar)

## 实施计划

### 第1步：核心类型定义和基础结构

- 定义 [`FileInfo`](file-manager.types.ts:3)、[`FileContent`](file-manager.types.ts:12) 等类型
- 创建 [`FileManager`](file-manager.ts:10) 类骨架
- 实现路径解析和验证方法
- 预计耗时：3 小时

### 第2步：文件读写操作

- 实现 [`readFile()`](file-manager.ts:15) 方法
- 实现 [`writeFile()`](file-manager.ts:16) 方法（含原子写入）
- 实现 [`deleteFile()`](file-manager.ts:17) 方法
- 添加错误处理
- 预计耗时：4 小时

### 第3步：目录操作

- 实现 [`listFiles()`](file-manager.ts:23) 方法
- 实现递归遍历逻辑
- 实现 [`createDirectory()`](file-manager.ts:21) 和 [`deleteDirectory()`](file-manager.ts:22) 方法
- 预计耗时：3 小时

### 第4步：文件监控

- 实现 [`FileWatcher`](file-watcher.ts:5) 类
- 集成 chokidar
- 实现事件回调机制
- 预计耗时：4 小时

### 第5步：IPC 集成

- 创建 [`FileHandler`](file.handler.ts:7) IPC 处理器
- 注册所有文件操作通道
- 实现渲染进程 API
- 预计耗时：3 小时

### 第6步：测试和文档

- 编写单元测试
- 编写集成测试
- 跨平台测试
- 编写 API 文档
- 预计耗时：5 小时

## 完成标准

**本任务完成的标志：**

1. [`FileManager`](file-manager.ts:10) 类实现所有核心方法
2. 所有文件操作通过 IPC 暴露给渲染进程
3. 文件监控功能正常工作
4. 单元测试覆盖率 ≥ 80%
5. 在 Mac 和 Windows 上测试通过

**交付物：**

- [ ] [`file-manager.ts`](file-manager.ts) - 文件管理器主类
- [ ] [`file-watcher.ts`](file-watcher.ts) - 文件监控服务
- [ ] [`file.handler.ts`](file.handler.ts) - IPC 处理器
- [ ] [`file-manager.types.ts`](file-manager.types.ts) - 类型定义
- [ ] 单元测试文件
- [ ] API 使用文档

## 备注

### 开发建议

1. 优先实现核心的读写功能，文件监控可以后置
2. 原子写入机制是关键，需要充分测试
3. 路径验证要严格，防止安全漏洞
4. 考虑使用 `graceful-fs` 替代原生 `fs` 以提高稳定性

### 已知问题

- Windows 上的路径长度限制（MAX_PATH = 260）
- 某些网络文件系统上的文件监控可能不稳定
- 大文件操作可能阻塞事件循环（需要在 Phase 1 优化）

---

**创建时间：** 2026-03-11  
**最后更新：** 2026-03-11  
**更新记录：**
- 2026-03-11 - 初始创建
