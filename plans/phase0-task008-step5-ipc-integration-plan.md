# Phase0-Task008 第5步：IPC 集成 - 执行计划

## 任务概述

**任务ID**: PHASE0-TASK008  
**步骤**: 第5步 - IPC 集成  
**目标**: 为 FileManager 创建 IPC 处理器，将文件操作能力暴露给渲染进程

## 背景分析

### 当前状态

根据 [`task-list.md`](../specs/tasks/phase0/task-list.md) 的记录：
- ✅ 第1步：类型定义已完成
- ✅ 第2步：文件读写操作已完成
- ✅ 第3步：目录操作已完成
- ✅ 第4步：文件监控已完成（chokidar 集成、FileWatcher 类、测试验证）

### 已有基础设施

1. **IPC 框架**（TASK002 已完成）
   - [`IpcHandler`](../sibylla-desktop/src/main/ipc/handler.ts) 基类：提供统一的错误处理和响应包装
   - [`IpcManager`](../sibylla-desktop/src/main/ipc/index.ts)：集中管理所有 IPC 处理器
   - [`safeHandle()`](../sibylla-desktop/src/main/ipc/handler.ts:181) 方法：自动错误处理和日志记录

2. **Preload 脚本**
   - [`safeInvoke()`](../sibylla-desktop/src/preload/index.ts:90) 方法：类型安全的 IPC 调用包装
   - 通道白名单机制：安全验证
   - 超时保护：30秒默认超时

3. **FileManager 服务**
   - 完整的文件操作 API（读写、目录、监控）
   - 路径安全验证
   - 原子写入机制
   - 文件监控功能

### 需要实现的内容

根据 [`phase0-task008_file-manager.md`](../specs/tasks/phase0/phase0-task008_file-manager.md:751) 第5步要求：

1. 创建 [`FileHandler`](../sibylla-desktop/src/main/ipc/handlers/file.handler.ts) IPC 处理器
2. 注册所有文件操作通道
3. 实现渲染进程 API
4. 处理文件监控事件的推送

## 技术方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     渲染进程 (Renderer)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  window.electronAPI.file.*                           │   │
│  │  - readFile(path, options?)                          │   │
│  │  - writeFile(path, content, options?)                │   │
│  │  - deleteFile(path)                                  │   │
│  │  - listFiles(path, options?)                         │   │
│  │  - getFileInfo(path)                                 │   │
│  │  - exists(path)                                      │   │
│  │  - createDirectory(path, recursive?)                 │   │
│  │  - deleteDirectory(path, recursive?)                 │   │
│  │  - startWatching(callback)                           │   │
│  │  - stopWatching()                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ IPC (contextBridge)
┌─────────────────────────────────────────────────────────────┐
│                     Preload 脚本                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  safeInvoke() 包装所有 IPC 调用                       │   │
│  │  - 超时保护 (30s)                                     │   │
│  │  - 错误处理                                           │   │
│  │  - 日志记录                                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ IPC (ipcRenderer.invoke)
┌─────────────────────────────────────────────────────────────┐
│                     主进程 (Main)                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  FileHandler extends IpcHandler                      │   │
│  │  - register(): 注册所有 IPC 通道                      │   │
│  │  - safeHandle(): 包装处理器方法                       │   │
│  │  - setFileManager(): 注入 FileManager 实例           │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  FileManager                                         │   │
│  │  - 文件读写操作                                       │   │
│  │  - 目录操作                                           │   │
│  │  - 文件监控                                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### IPC 通道设计

根据 [`IPC_CHANNELS`](../sibylla-desktop/src/shared/types.ts:47) 定义，需要实现以下通道：

```typescript
// 文件操作（已在 types.ts 中预留）
FILE_READ: 'file:read'
FILE_WRITE: 'file:write'
FILE_DELETE: 'file:delete'
FILE_LIST: 'file:list'
FILE_INFO: 'file:info'          // 新增
FILE_EXISTS: 'file:exists'      // 新增
FILE_COPY: 'file:copy'          // 新增
FILE_MOVE: 'file:move'          // 新增

// 目录操作（新增）
DIR_CREATE: 'dir:create'
DIR_DELETE: 'dir:delete'

// 文件监控（新增）
FILE_WATCH_START: 'file:watch:start'
FILE_WATCH_STOP: 'file:watch:stop'
FILE_WATCH_EVENT: 'file:watch:event'  // 主进程 → 渲染进程推送
```

### 类型定义

需要在 [`shared/types.ts`](../sibylla-desktop/src/shared/types.ts) 中添加文件操作相关类型：

```typescript
// 文件操作请求/响应类型
export interface FileReadRequest {
  path: string
  options?: {
    encoding?: BufferEncoding
    maxSize?: number
  }
}

export interface FileReadResponse {
  path: string
  content: string
  encoding: string
  size: number
}

export interface FileWriteRequest {
  path: string
  content: string
  options?: {
    encoding?: BufferEncoding
    atomic?: boolean
    createDirs?: boolean
  }
}

export interface FileListRequest {
  path: string
  options?: {
    recursive?: boolean
    includeHidden?: boolean
  }
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

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  stats?: FileInfo
}
```

## 实施步骤

### 步骤 5.1：扩展 IPC 通道定义

**文件**: [`sibylla-desktop/src/shared/types.ts`](../sibylla-desktop/src/shared/types.ts)

**操作**:
1. 在 `IPC_CHANNELS` 中添加缺失的文件操作通道
2. 添加文件操作相关的类型定义
3. 确保类型与 [`file-manager.types.ts`](../sibylla-desktop/src/main/services/types/file-manager.types.ts) 兼容

**预期结果**:
- 所有文件操作通道都有明确定义
- 类型定义完整且类型安全

### 步骤 5.2：创建 FileHandler IPC 处理器

**文件**: `sibylla-desktop/src/main/ipc/handlers/file.handler.ts`（新建）

**操作**:
1. 创建 `FileHandler` 类，继承 `IpcHandler`
2. 实现 `register()` 方法，注册所有文件操作通道
3. 实现各个文件操作的处理方法：
   - `readFile()`
   - `writeFile()`
   - `deleteFile()`
   - `copyFile()`
   - `moveFile()`
   - `listFiles()`
   - `getFileInfo()`
   - `exists()`
   - `createDirectory()`
   - `deleteDirectory()`
   - `startWatching()`
   - `stopWatching()`
4. 添加 `setFileManager()` 方法用于依赖注入
5. 实现文件监控事件的推送逻辑

**关键实现点**:

```typescript
export class FileHandler extends IpcHandler {
  readonly namespace = 'file'
  private fileManager: FileManager | null = null
  
  setFileManager(fileManager: FileManager): void {
    this.fileManager = fileManager
  }
  
  register(): void {
    // 注册所有 IPC 通道
    ipcMain.handle(IPC_CHANNELS.FILE_READ, this.safeHandle(this.readFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_WRITE, this.safeHandle(this.writeFile.bind(this)))
    // ... 其他通道
  }
  
  private async readFile(
    _event: IpcMainInvokeEvent,
    path: string,
    options?: ReadFileOptions
  ): Promise<FileContent> {
    if (!this.fileManager) {
      throw new Error('FileManager not initialized')
    }
    return await this.fileManager.readFile(path, options)
  }
  
  // 文件监控事件推送
  private async startWatching(
    event: IpcMainInvokeEvent
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('FileManager not initialized')
    }
    
    await this.fileManager.startWatching((watchEvent) => {
      // 推送事件到渲染进程
      event.sender.send(IPC_CHANNELS.FILE_WATCH_EVENT, watchEvent)
    })
  }
}
```

**预期结果**:
- FileHandler 类完整实现
- 所有文件操作都有对应的 IPC 处理器
- 文件监控事件能正确推送到渲染进程

### 步骤 5.3：在主进程中注册 FileHandler

**文件**: [`sibylla-desktop/src/main/index.ts`](../sibylla-desktop/src/main/index.ts)

**操作**:
1. 导入 `FileHandler` 和 `FileManager`
2. 创建 `FileManager` 实例（使用临时 workspace 路径）
3. 创建 `FileHandler` 实例并注入 `FileManager`
4. 通过 `ipcManager` 注册 `FileHandler`

**关键代码**:

```typescript
import { FileHandler } from './ipc/handlers/file.handler'
import { FileManager } from './services/file-manager'

// 在 app.whenReady() 中
const workspaceRoot = path.join(app.getPath('userData'), 'workspace')
const fileManager = new FileManager(workspaceRoot)

const fileHandler = new FileHandler()
fileHandler.setFileManager(fileManager)
ipcManager.registerHandler(fileHandler)
```

**预期结果**:
- FileHandler 成功注册到 IPC 管理器
- FileManager 实例正确注入

### 步骤 5.4：扩展 Preload 脚本

**文件**: [`sibylla-desktop/src/preload/index.ts`](../sibylla-desktop/src/preload/index.ts)

**操作**:
1. 在 `ALLOWED_CHANNELS` 中添加所有文件操作通道
2. 在 `ElectronAPI` 接口中添加文件操作方法
3. 实现文件操作 API，使用 `safeInvoke()` 包装
4. 实现文件监控 API（使用事件监听器）

**关键实现**:

```typescript
interface ElectronAPI {
  // ... 现有方法
  
  // 文件操作
  file: {
    read: (path: string, options?: ReadFileOptions) => Promise<IPCResponse<FileContent>>
    write: (path: string, content: string, options?: WriteFileOptions) => Promise<IPCResponse<void>>
    delete: (path: string) => Promise<IPCResponse<void>>
    copy: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    move: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    list: (path: string, options?: ListFilesOptions) => Promise<IPCResponse<FileInfo[]>>
    getInfo: (path: string) => Promise<IPCResponse<FileInfo>>
    exists: (path: string) => Promise<IPCResponse<boolean>>
    
    // 目录操作
    createDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    deleteDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    
    // 文件监控
    startWatching: () => Promise<IPCResponse<void>>
    stopWatching: () => Promise<IPCResponse<void>>
    onFileChange: (callback: (event: FileWatchEvent) => void) => () => void
  }
}

// 实现
const api: ElectronAPI = {
  // ... 现有实现
  
  file: {
    read: async (path, options) => 
      await safeInvoke<FileContent>(IPC_CHANNELS.FILE_READ, path, options),
    
    write: async (path, content, options) => 
      await safeInvoke<void>(IPC_CHANNELS.FILE_WRITE, path, content, options),
    
    // ... 其他方法
    
    onFileChange: (callback) => {
      return api.on(IPC_CHANNELS.FILE_WATCH_EVENT, callback)
    }
  }
}
```

**预期结果**:
- 渲染进程可以通过 `window.electronAPI.file.*` 访问所有文件操作
- 类型安全且有完整的 TypeScript 支持

### 步骤 5.5：编写集成测试

**文件**: `sibylla-desktop/tests/ipc/file-handler.test.ts`（新建）

**操作**:
1. 创建测试文件
2. 编写 FileHandler 的集成测试
3. 测试所有文件操作通道
4. 测试文件监控事件推送
5. 测试错误处理

**测试用例**:

```typescript
describe('FileHandler IPC Integration', () => {
  let fileManager: FileManager
  let fileHandler: FileHandler
  let testWorkspace: string
  
  beforeEach(async () => {
    // 创建临时测试 workspace
    testWorkspace = path.join(os.tmpdir(), `sibylla-test-${Date.now()}`)
    await fs.mkdir(testWorkspace, { recursive: true })
    
    // 初始化 FileManager 和 FileHandler
    fileManager = new FileManager(testWorkspace)
    fileHandler = new FileHandler()
    fileHandler.setFileManager(fileManager)
    fileHandler.register()
  })
  
  afterEach(async () => {
    // 清理
    fileHandler.cleanup()
    await fs.rm(testWorkspace, { recursive: true, force: true })
  })
  
  describe('文件读写操作', () => {
    it('应该能够读取文件', async () => {
      // 测试 FILE_READ 通道
    })
    
    it('应该能够写入文件', async () => {
      // 测试 FILE_WRITE 通道
    })
    
    it('应该能够删除文件', async () => {
      // 测试 FILE_DELETE 通道
    })
  })
  
  describe('目录操作', () => {
    it('应该能够列出文件', async () => {
      // 测试 FILE_LIST 通道
    })
    
    it('应该能够创建目录', async () => {
      // 测试 DIR_CREATE 通道
    })
  })
  
  describe('文件监控', () => {
    it('应该能够启动文件监控', async () => {
      // 测试 FILE_WATCH_START 通道
    })
    
    it('应该能够接收文件变化事件', async () => {
      // 测试 FILE_WATCH_EVENT 推送
    })
  })
  
  describe('错误处理', () => {
    it('应该正确处理文件不存在错误', async () => {
      // 测试错误响应格式
    })
    
    it('应该正确处理路径验证错误', async () => {
      // 测试路径安全验证
    })
  })
})
```

**预期结果**:
- 所有测试用例通过
- 测试覆盖率 ≥ 80%

### 步骤 5.6：编写使用文档

**文件**: `sibylla-desktop/docs/file-operations-api.md`（新建）

**内容**:
1. API 概述
2. 文件操作 API 参考
3. 使用示例
4. 错误处理指南
5. 最佳实践

**预期结果**:
- 完整的 API 文档
- 清晰的使用示例

## 相关文件清单

### 需要调用的设计文档

- [`specs/design/architecture.md`](../specs/design/architecture.md) - 系统架构设计
- [`specs/design/data-and-api.md`](../specs/design/data-and-api.md) - IPC 接口设计

### 需要调用的 Skills

- [`@/.kilocode/skills/phase0/electron-ipc-patterns`](../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md) - IPC 通信模式
- [`@/.kilocode/skills/phase0/typescript-strict-mode`](../.kilocode/skills/phase0/typescript-strict-mode/SKILL.md) - TypeScript 严格模式

### 需要修改的文件

1. **新建文件**:
   - `sibylla-desktop/src/main/ipc/handlers/file.handler.ts` - FileHandler 实现
   - `sibylla-desktop/tests/ipc/file-handler.test.ts` - 集成测试
   - `sibylla-desktop/docs/file-operations-api.md` - API 文档

2. **修改文件**:
   - [`sibylla-desktop/src/shared/types.ts`](../sibylla-desktop/src/shared/types.ts) - 添加文件操作类型
   - [`sibylla-desktop/src/preload/index.ts`](../sibylla-desktop/src/preload/index.ts) - 扩展 API
   - [`sibylla-desktop/src/main/index.ts`](../sibylla-desktop/src/main/index.ts) - 注册 FileHandler

## 验收标准

### 功能完整性

- [ ] 所有文件操作都有对应的 IPC 通道
- [ ] 渲染进程可以通过 `window.electronAPI.file.*` 调用所有文件操作
- [ ] 文件监控事件能正确推送到渲染进程
- [ ] 错误处理完整且信息清晰

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有公共方法有 JSDoc 注释
- [ ] 遵循 [`electron-ipc-patterns`](../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md) 最佳实践

### 测试覆盖

- [ ] 集成测试覆盖率 ≥ 80%
- [ ] 所有 IPC 通道都有测试用例
- [ ] 错误处理有完整测试

### 文档完整性

- [ ] API 文档完整
- [ ] 使用示例清晰
- [ ] 错误处理指南完善

## 风险与注意事项

### 技术风险

1. **文件监控事件推送**
   - 风险：主进程向渲染进程推送事件可能失败
   - 缓解：添加错误处理，确保 `event.sender` 有效

2. **FileManager 实例管理**
   - 风险：多个 workspace 切换时 FileManager 实例管理复杂
   - 缓解：当前阶段使用单一 workspace，Phase 1 再优化

3. **IPC 性能**
   - 风险：大量文件操作可能导致 IPC 性能问题
   - 缓解：使用 `safeHandle()` 的超时保护，Phase 1 优化大文件处理

### 开发注意事项

1. **类型一致性**
   - 确保 `shared/types.ts` 中的类型与 `file-manager.types.ts` 兼容
   - Date 对象需要序列化为 ISO 8601 字符串

2. **错误处理**
   - 使用 `IpcHandler.safeHandle()` 自动包装错误
   - 确保 `FileManagerError` 正确映射到 `ErrorType`

3. **安全性**
   - 所有文件操作通道都要在 `ALLOWED_CHANNELS` 白名单中
   - 路径验证在 FileManager 层已完成，IPC 层无需重复

4. **日志记录**
   - 使用 `logger` 记录关键操作
   - 开发模式下输出详细日志

## 时间估算

- 步骤 5.1：扩展 IPC 通道定义 - 30 分钟
- 步骤 5.2：创建 FileHandler - 1.5 小时
- 步骤 5.3：注册 FileHandler - 15 分钟
- 步骤 5.4：扩展 Preload 脚本 - 45 分钟
- 步骤 5.5：编写集成测试 - 1.5 小时
- 步骤 5.6：编写使用文档 - 30 分钟

**总计**: 约 5 小时

## 下一步

完成第5步后：
1. 更新 [`task-list.md`](../specs/tasks/phase0/task-list.md) 标记 TASK008 完成
2. 进入 TASK009：Workspace 创建与初始化
3. 在 TASK009 中使用 FileHandler 实现 workspace 文件操作

---

**创建时间**: 2026-03-12  
**创建人**: AI Architect
