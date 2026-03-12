# Phase0-Task008 第5步：IPC 集成 - 实施检查清单

## 步骤 5.1：扩展 IPC 通道定义

### 文件：`sibylla-desktop/src/shared/types.ts`

#### 1. 添加 IPC 通道常量

```typescript
export const IPC_CHANNELS = {
  // ... 现有通道
  
  // 文件操作（补充缺失的）
  FILE_INFO: 'file:info',
  FILE_EXISTS: 'file:exists',
  FILE_COPY: 'file:copy',
  FILE_MOVE: 'file:move',
  
  // 目录操作（新增）
  DIR_CREATE: 'dir:create',
  DIR_DELETE: 'dir:delete',
  
  // 文件监控（新增）
  FILE_WATCH_START: 'file:watch:start',
  FILE_WATCH_STOP: 'file:watch:stop',
  FILE_WATCH_EVENT: 'file:watch:event',
} as const
```

**检查项**:
- [ ] 所有通道名称遵循 `namespace:action` 格式
- [ ] 通道名称与 FileManager 方法对应
- [ ] 使用 `as const` 确保类型推断

#### 2. 添加文件操作类型定义

```typescript
/**
 * File operation request/response types
 */

// 文件读取
export interface FileReadOptions {
  encoding?: BufferEncoding
  maxSize?: number
}

export interface FileContent {
  path: string
  content: string
  encoding: string
  size: number
}

// 文件写入
export interface FileWriteOptions {
  encoding?: BufferEncoding
  atomic?: boolean
  createDirs?: boolean
}

// 文件列表
export interface ListFilesOptions {
  recursive?: boolean
  includeHidden?: boolean
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedTime: string  // ISO 8601 格式
  createdTime: string   // ISO 8601 格式
  extension?: string
}

// 文件监控
export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  stats?: FileInfo
}
```

**检查项**:
- [ ] 类型定义与 `file-manager.types.ts` 兼容
- [ ] Date 对象使用 string 类型（ISO 8601）
- [ ] 所有可选字段标记为 `?`
- [ ] 添加 JSDoc 注释

#### 3. 验证类型导出

```typescript
// 确保类型被正确导出
export type {
  FileReadOptions,
  FileContent,
  FileWriteOptions,
  ListFilesOptions,
  FileInfo,
  FileWatchEvent,
}
```

**检查项**:
- [ ] 所有新类型都被导出
- [ ] 类型可以在其他模块中导入

---

## 步骤 5.2：创建 FileHandler IPC 处理器

### 文件：`sibylla-desktop/src/main/ipc/handlers/file.handler.ts`（新建）

#### 1. 导入依赖

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { FileManager } from '../../services/file-manager'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  FileContent,
  FileReadOptions,
  FileWriteOptions,
  ListFilesOptions,
  FileInfo,
  FileWatchEvent,
} from '../../../shared/types'
import type {
  ReadFileOptions,
  WriteFileOptions,
  ListFilesOptions as ManagerListOptions,
} from '../../services/types/file-manager.types'
```

**检查项**:
- [ ] 导入所有必要的类型
- [ ] 区分 shared 类型和 manager 类型
- [ ] 使用 `type` 导入类型

#### 2. 实现 FileHandler 类骨架

```typescript
export class FileHandler extends IpcHandler {
  readonly namespace = 'file'
  private fileManager: FileManager | null = null
  
  /**
   * Set FileManager instance
   */
  setFileManager(fileManager: FileManager): void {
    this.fileManager = fileManager
    console.log('[FileHandler] FileManager instance set')
  }
  
  /**
   * Register all file operation IPC handlers
   */
  register(): void {
    // 文件读写操作
    ipcMain.handle(IPC_CHANNELS.FILE_READ, this.safeHandle(this.readFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_WRITE, this.safeHandle(this.writeFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_DELETE, this.safeHandle(this.deleteFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_COPY, this.safeHandle(this.copyFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_MOVE, this.safeHandle(this.moveFile.bind(this)))
    
    // 文件信息
    ipcMain.handle(IPC_CHANNELS.FILE_INFO, this.safeHandle(this.getFileInfo.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, this.safeHandle(this.exists.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_LIST, this.safeHandle(this.listFiles.bind(this)))
    
    // 目录操作
    ipcMain.handle(IPC_CHANNELS.DIR_CREATE, this.safeHandle(this.createDirectory.bind(this)))
    ipcMain.handle(IPC_CHANNELS.DIR_DELETE, this.safeHandle(this.deleteDirectory.bind(this)))
    
    // 文件监控
    ipcMain.handle(IPC_CHANNELS.FILE_WATCH_START, this.safeHandle(this.startWatching.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_WATCH_STOP, this.safeHandle(this.stopWatching.bind(this)))
    
    console.log('[FileHandler] All handlers registered')
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.fileManager) {
      // 停止文件监控
      this.fileManager.stopWatching().catch(err => {
        console.error('[FileHandler] Error stopping file watcher:', err)
      })
    }
    super.cleanup()
  }
}
```

**检查项**:
- [ ] 继承 `IpcHandler` 基类
- [ ] 实现 `namespace` 属性
- [ ] 实现 `register()` 方法
- [ ] 所有处理器使用 `safeHandle()` 包装
- [ ] 实现 `cleanup()` 方法

#### 3. 实现文件读写方法

```typescript
private async readFile(
  _event: IpcMainInvokeEvent,
  path: string,
  options?: FileReadOptions
): Promise<FileContent> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  // 转换选项类型
  const managerOptions: ReadFileOptions = {
    encoding: options?.encoding,
    maxSize: options?.maxSize,
  }
  
  const result = await this.fileManager.readFile(path, managerOptions)
  
  return result
}

private async writeFile(
  _event: IpcMainInvokeEvent,
  path: string,
  content: string,
  options?: FileWriteOptions
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  const managerOptions: WriteFileOptions = {
    encoding: options?.encoding,
    atomic: options?.atomic,
    createDirs: options?.createDirs,
  }
  
  await this.fileManager.writeFile(path, content, managerOptions)
}

private async deleteFile(
  _event: IpcMainInvokeEvent,
  path: string
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  await this.fileManager.deleteFile(path)
}

private async copyFile(
  _event: IpcMainInvokeEvent,
  sourcePath: string,
  destPath: string
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  await this.fileManager.copyFile(sourcePath, destPath)
}

private async moveFile(
  _event: IpcMainInvokeEvent,
  sourcePath: string,
  destPath: string
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  await this.fileManager.moveFile(sourcePath, destPath)
}
```

**检查项**:
- [ ] 所有方法检查 `fileManager` 是否初始化
- [ ] 参数类型与 IPC 通道定义一致
- [ ] 返回类型与 shared 类型一致
- [ ] 正确转换选项类型

#### 4. 实现文件信息方法

```typescript
private async getFileInfo(
  _event: IpcMainInvokeEvent,
  path: string
): Promise<FileInfo> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  const info = await this.fileManager.getFileInfo(path)
  
  // 转换 Date 对象为 ISO 8601 字符串
  return {
    ...info,
    modifiedTime: info.modifiedTime.toISOString(),
    createdTime: info.createdTime.toISOString(),
  }
}

private async exists(
  _event: IpcMainInvokeEvent,
  path: string
): Promise<boolean> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  return await this.fileManager.exists(path)
}

private async listFiles(
  _event: IpcMainInvokeEvent,
  path: string,
  options?: ListFilesOptions
): Promise<FileInfo[]> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  const managerOptions: ManagerListOptions = {
    recursive: options?.recursive,
    includeHidden: options?.includeHidden,
  }
  
  const files = await this.fileManager.listFiles(path, managerOptions)
  
  // 转换 Date 对象为 ISO 8601 字符串
  return files.map(file => ({
    ...file,
    modifiedTime: file.modifiedTime.toISOString(),
    createdTime: file.createdTime.toISOString(),
  }))
}
```

**检查项**:
- [ ] Date 对象正确转换为 ISO 8601 字符串
- [ ] 数组结果正确映射
- [ ] 类型转换正确

#### 5. 实现目录操作方法

```typescript
private async createDirectory(
  _event: IpcMainInvokeEvent,
  path: string,
  recursive?: boolean
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  await this.fileManager.createDirectory(path, recursive)
}

private async deleteDirectory(
  _event: IpcMainInvokeEvent,
  path: string,
  recursive?: boolean
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  await this.fileManager.deleteDirectory(path, recursive)
}
```

**检查项**:
- [ ] 参数正确传递
- [ ] 可选参数处理正确

#### 6. 实现文件监控方法

```typescript
private async startWatching(
  event: IpcMainInvokeEvent
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  // 启动文件监控，并设置事件回调
  await this.fileManager.startWatching((watchEvent) => {
    // 转换事件格式
    const ipcEvent: FileWatchEvent = {
      type: watchEvent.type,
      path: watchEvent.path,
      stats: watchEvent.stats ? {
        ...watchEvent.stats,
        modifiedTime: watchEvent.stats.modifiedTime.toISOString(),
        createdTime: watchEvent.stats.createdTime.toISOString(),
      } : undefined,
    }
    
    // 推送事件到渲染进程
    event.sender.send(IPC_CHANNELS.FILE_WATCH_EVENT, ipcEvent)
  })
  
  console.log('[FileHandler] File watching started')
}

private async stopWatching(
  _event: IpcMainInvokeEvent
): Promise<void> {
  if (!this.fileManager) {
    throw new Error('FileManager not initialized')
  }
  
  await this.fileManager.stopWatching()
  console.log('[FileHandler] File watching stopped')
}
```

**检查项**:
- [ ] 使用 `event.sender.send()` 推送事件
- [ ] 事件格式正确转换
- [ ] Date 对象转换为字符串
- [ ] 添加日志记录

---

## 步骤 5.3：在主进程中注册 FileHandler

### 文件：`sibylla-desktop/src/main/index.ts`

#### 1. 导入依赖

```typescript
import { FileHandler } from './ipc/handlers/file.handler'
import { FileManager } from './services/file-manager'
import * as path from 'path'
```

**检查项**:
- [ ] 导入 FileHandler
- [ ] 导入 FileManager
- [ ] 导入 path 模块

#### 2. 初始化 FileManager

```typescript
// 在 app.whenReady() 中
app.whenReady().then(() => {
  // ... 现有代码
  
  // 初始化 FileManager
  // 注意：这里使用临时路径，实际应该在 workspace 创建后使用真实路径
  const workspaceRoot = path.join(app.getPath('userData'), 'workspace')
  const fileManager = new FileManager(workspaceRoot)
  
  console.log('[Main] FileManager initialized with workspace:', workspaceRoot)
  
  // ... 继续
})
```

**检查项**:
- [ ] workspace 路径正确
- [ ] FileManager 实例创建成功
- [ ] 添加日志记录

#### 3. 注册 FileHandler

```typescript
// 在 ipcManager.initialize() 之后
ipcManager.initialize()

// 注册现有 handlers
ipcManager.registerHandler(new TestHandler())
ipcManager.registerHandler(new SystemHandler())

// 注册 FileHandler
const fileHandler = new FileHandler()
fileHandler.setFileManager(fileManager)
ipcManager.registerHandler(fileHandler)

console.log('[Main] FileHandler registered')
```

**检查项**:
- [ ] FileHandler 在 ipcManager 初始化后注册
- [ ] FileManager 实例正确注入
- [ ] 添加日志记录

#### 4. 清理资源

```typescript
// 在 app.on('will-quit') 中
app.on('will-quit', () => {
  console.log('[Main] Application will quit, cleaning up...')
  ipcManager.cleanup()  // 会自动调用 FileHandler.cleanup()
})
```

**检查项**:
- [ ] 应用退出时清理资源
- [ ] ipcManager.cleanup() 被调用

---

## 步骤 5.4：扩展 Preload 脚本

### 文件：`sibylla-desktop/src/preload/index.ts`

#### 1. 更新通道白名单

```typescript
const ALLOWED_CHANNELS: IPCChannel[] = [
  // ... 现有通道
  
  // 文件操作
  IPC_CHANNELS.FILE_READ,
  IPC_CHANNELS.FILE_WRITE,
  IPC_CHANNELS.FILE_DELETE,
  IPC_CHANNELS.FILE_COPY,
  IPC_CHANNELS.FILE_MOVE,
  IPC_CHANNELS.FILE_INFO,
  IPC_CHANNELS.FILE_EXISTS,
  IPC_CHANNELS.FILE_LIST,
  
  // 目录操作
  IPC_CHANNELS.DIR_CREATE,
  IPC_CHANNELS.DIR_DELETE,
  
  // 文件监控
  IPC_CHANNELS.FILE_WATCH_START,
  IPC_CHANNELS.FILE_WATCH_STOP,
  IPC_CHANNELS.FILE_WATCH_EVENT,
]
```

**检查项**:
- [ ] 所有文件操作通道都在白名单中
- [ ] 通道名称与 IPC_CHANNELS 一致

#### 2. 扩展 ElectronAPI 接口

```typescript
interface ElectronAPI {
  // ... 现有方法
  
  // 文件操作
  file: {
    // 文件读写
    read: (path: string, options?: FileReadOptions) => Promise<IPCResponse<FileContent>>
    write: (path: string, content: string, options?: FileWriteOptions) => Promise<IPCResponse<void>>
    delete: (path: string) => Promise<IPCResponse<void>>
    copy: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    move: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    
    // 文件信息
    getInfo: (path: string) => Promise<IPCResponse<FileInfo>>
    exists: (path: string) => Promise<IPCResponse<boolean>>
    list: (path: string, options?: ListFilesOptions) => Promise<IPCResponse<FileInfo[]>>
    
    // 目录操作
    createDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    deleteDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    
    // 文件监控
    startWatching: () => Promise<IPCResponse<void>>
    stopWatching: () => Promise<IPCResponse<void>>
    onFileChange: (callback: (event: FileWatchEvent) => void) => () => void
  }
}
```

**检查项**:
- [ ] 所有方法返回 `Promise<IPCResponse<T>>`
- [ ] 参数类型与 shared 类型一致
- [ ] 文件监控使用事件监听器模式

#### 3. 实现文件操作 API

```typescript
const api: ElectronAPI = {
  // ... 现有实现
  
  file: {
    // 文件读写
    read: async (path, options) => 
      await safeInvoke<FileContent>(IPC_CHANNELS.FILE_READ, path, options),
    
    write: async (path, content, options) => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_WRITE, path, content, options),
    
    delete: async (path) => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_DELETE, path),
    
    copy: async (sourcePath, destPath) => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_COPY, sourcePath, destPath),
    
    move: async (sourcePath, destPath) => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_MOVE, sourcePath, destPath),
    
    // 文件信息
    getInfo: async (path) => 
      await safeInvoke<FileInfo>(IPC_CHANNELS.FILE_INFO, path),
    
    exists: async (path) => 
      await safeInvoke<boolean>(IPC_CHANNELS.FILE_EXISTS, path),
    
    list: async (path, options) => 
      await safeInvoke<FileInfo[]>(IPC_CHANNELS.FILE_LIST, path, options),
    
    // 目录操作
    createDir: async (path, recursive) => 
      await safeInvoke<void>(IPC_CHANNELS.DIR_CREATE, path, recursive),
    
    deleteDir: async (path, recursive) => 
      await safeInvoke<void>(IPC_CHANNELS.DIR_DELETE, path, recursive),
    
    // 文件监控
    startWatching: async () => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_WATCH_START),
    
    stopWatching: async () => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_WATCH_STOP),
    
    onFileChange: (callback) => {
      return api.on(IPC_CHANNELS.FILE_WATCH_EVENT, callback)
    },
  },
}
```

**检查项**:
- [ ] 所有方法使用 `safeInvoke()` 包装
- [ ] 泛型类型正确
- [ ] 参数正确传递
- [ ] 文件监控使用 `api.on()` 注册事件

---

## 步骤 5.5：编写集成测试

### 文件：`sibylla-desktop/tests/ipc/file-handler.test.ts`（新建）

#### 测试结构

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileHandler } from '../../src/main/ipc/handlers/file.handler'
import { FileManager } from '../../src/main/services/file-manager'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('FileHandler IPC Integration', () => {
  let fileManager: FileManager
  let fileHandler: FileHandler
  let testWorkspace: string
  
  beforeEach(async () => {
    // 设置测试环境
  })
  
  afterEach(async () => {
    // 清理测试环境
  })
  
  describe('文件读写操作', () => {
    // 测试用例
  })
  
  describe('目录操作', () => {
    // 测试用例
  })
  
  describe('文件监控', () => {
    // 测试用例
  })
  
  describe('错误处理', () => {
    // 测试用例
  })
})
```

**检查项**:
- [ ] 测试文件结构清晰
- [ ] 使用 describe 分组
- [ ] beforeEach/afterEach 正确设置

#### 关键测试用例

**检查项**:
- [ ] 测试文件读取
- [ ] 测试文件写入
- [ ] 测试文件删除
- [ ] 测试文件复制
- [ ] 测试文件移动
- [ ] 测试目录列表
- [ ] 测试目录创建
- [ ] 测试目录删除
- [ ] 测试文件监控启动
- [ ] 测试文件监控事件
- [ ] 测试错误处理
- [ ] 测试路径验证

---

## 步骤 5.6：编写使用文档

### 文件：`sibylla-desktop/docs/file-operations-api.md`（新建）

#### 文档结构

```markdown
# 文件操作 API 文档

## 概述

## API 参考

### 文件读写操作
- readFile()
- writeFile()
- deleteFile()
- copyFile()
- moveFile()

### 文件信息
- getInfo()
- exists()
- list()

### 目录操作
- createDir()
- deleteDir()

### 文件监控
- startWatching()
- stopWatching()
- onFileChange()

## 使用示例

## 错误处理

## 最佳实践
```

**检查项**:
- [ ] 所有 API 都有文档
- [ ] 包含使用示例
- [ ] 包含错误处理指南
- [ ] 包含最佳实践

---

## 最终验收检查

### 功能完整性

- [ ] 所有文件操作都有 IPC 通道
- [ ] 渲染进程可以调用所有文件操作
- [ ] 文件监控事件正确推送
- [ ] 错误处理完整

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有方法有 JSDoc 注释
- [ ] 遵循 IPC 最佳实践

### 测试覆盖

- [ ] 集成测试覆盖率 ≥ 80%
- [ ] 所有 IPC 通道有测试
- [ ] 错误处理有测试

### 文档完整性

- [ ] API 文档完整
- [ ] 使用示例清晰
- [ ] 错误处理指南完善

---

**创建时间**: 2026-03-12  
**用途**: 逐步实施检查清单，确保实现质量
