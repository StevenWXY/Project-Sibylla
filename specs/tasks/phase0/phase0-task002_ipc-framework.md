# IPC 通信框架实现

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK002 |
| **任务标题** | IPC 通信框架实现 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 1.5-2 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

建立类型安全的 IPC（进程间通信）框架，实现 Electron 主进程与渲染进程之间的安全通信机制，为所有后续功能提供可靠的数据交互基础。

### 背景

Electron 应用采用多进程架构，渲染进程（UI）和主进程（系统访问）需要通过 IPC 进行通信。为了确保安全性，必须使用 contextBridge 暴露受控的 API，同时禁用 nodeIntegration。本任务将建立标准化的 IPC 通信模式，确保类型安全和错误处理。

### 范围

**包含：**
- Preload 脚本实现（contextBridge API 暴露）
- 主进程 IPC 处理器框架
- 类型定义系统（TypeScript 类型安全）
- 错误处理和日志记录机制
- 基础 IPC 通道实现（测试用）
- 双向通信支持（invoke/handle 和 send/on）

**不包含：**
- 具体业务逻辑的 IPC 处理器（在各功能任务中实现）
- 文件系统相关 IPC（TASK008）
- Git 相关 IPC（TASK010）

## 技术要求

### 技术栈

- **Electron IPC:** ipcMain, ipcRenderer, contextBridge
- **TypeScript:** 严格类型定义
- **事件系统:** EventEmitter（用于主进程内部事件）

### 架构设计

```
src/
├── main/
│   ├── ipc/
│   │   ├── index.ts              # IPC 处理器注册中心
│   │   ├── handler.ts            # IPC 处理器基类
│   │   ├── handlers/             # 具体处理器
│   │   │   ├── system.handler.ts # 系统信息处理器
│   │   │   └── test.handler.ts   # 测试处理器
│   │   └── types.ts              # IPC 类型定义
├── preload/
│   ├── index.ts                  # Preload 入口
│   └── api.ts                    # API 定义
└── shared/
    ├── ipc-channels.ts           # IPC 通道常量
    └── types.ts                  # 共享类型定义
```

### 实现细节

#### 1. IPC 通道常量定义

```typescript
// src/shared/ipc-channels.ts
export const IPC_CHANNELS = {
  // 系统相关
  SYSTEM_INFO: 'system:info',
  SYSTEM_PLATFORM: 'system:platform',
  
  // 测试相关
  TEST_PING: 'test:ping',
  TEST_ECHO: 'test:echo',
  
  // 窗口相关
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  
  // 事件通知（主进程 -> 渲染进程）
  NOTIFICATION: 'notification',
  LOG: 'log'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
```

#### 2. 类型定义系统

```typescript
// src/shared/types.ts
export interface IpcRequest<T = any> {
  channel: string
  data?: T
  requestId?: string
}

export interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    stack?: string
  }
  requestId?: string
}

// API 类型定义
export interface IpcApi {
  // 双向通信：渲染进程调用，主进程响应
  invoke<T = any, R = any>(channel: string, data?: T): Promise<R>
  
  // 单向通信：渲染进程发送，主进程接收
  send(channel: string, ...args: any[]): void
  
  // 事件监听：主进程发送，渲染进程接收
  on(channel: string, callback: (...args: any[]) => void): () => void
  
  // 移除监听器
  off(channel: string, callback: (...args: any[]) => void): void
}

declare global {
  interface Window {
    api: IpcApi
  }
}
```

#### 3. Preload 脚本实现

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IpcApi } from '../shared/types'

// 验证通道白名单（安全措施）
const ALLOWED_CHANNELS = [
  'system:info',
  'system:platform',
  'test:ping',
  'test:echo',
  'window:minimize',
  'window:maximize',
  'window:close',
  'notification',
  'log'
]

function isChannelAllowed(channel: string): boolean {
  return ALLOWED_CHANNELS.some(allowed => 
    channel === allowed || channel.startsWith(allowed.split(':')[0] + ':')
  )
}

// 构建 API 对象
const api: IpcApi = {
  invoke: async <T = any, R = any>(channel: string, data?: T): Promise<R> => {
    if (!isChannelAllowed(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`)
    }
    
    try {
      const response = await ipcRenderer.invoke(channel, data)
      
      if (response && !response.success && response.error) {
        const error = new Error(response.error.message)
        error.name = response.error.code
        if (response.error.stack) {
          error.stack = response.error.stack
        }
        throw error
      }
      
      return response?.data ?? response
    } catch (error) {
      console.error(`[IPC] Error invoking ${channel}:`, error)
      throw error
    }
  },
  
  send: (channel: string, ...args: any[]): void => {
    if (!isChannelAllowed(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`)
    }
    ipcRenderer.send(channel, ...args)
  },
  
  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    if (!isChannelAllowed(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`)
    }
    
    const subscription = (_event: IpcRendererEvent, ...args: any[]) => {
      callback(...args)
    }
    
    ipcRenderer.on(channel, subscription)
    
    // 返回取消订阅函数
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  
  off: (channel: string, callback: (...args: any[]) => void): void => {
    if (!isChannelAllowed(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`)
    }
    ipcRenderer.removeListener(channel, callback)
  }
}

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('api', api)

// 开发环境日志
if (process.env.NODE_ENV === 'development') {
  console.log('[Preload] IPC API exposed to renderer process')
}
```

#### 4. 主进程 IPC 处理器基类

```typescript
// src/main/ipc/handler.ts
import { IpcMainInvokeEvent } from 'electron'
import { IpcResponse } from '../../shared/types'

export abstract class IpcHandler {
  abstract readonly namespace: string
  
  /**
   * 注册 IPC 处理器
   */
  abstract register(): void
  
  /**
   * 包装响应，统一格式
   */
  protected wrapResponse<T>(data: T): IpcResponse<T> {
    return {
      success: true,
      data
    }
  }
  
  /**
   * 包装错误响应
   */
  protected wrapError(error: Error | string, code: string = 'UNKNOWN_ERROR'): IpcResponse {
    const errorObj = typeof error === 'string' ? new Error(error) : error
    
    return {
      success: false,
      error: {
        code,
        message: errorObj.message,
        stack: process.env.NODE_ENV === 'development' ? errorObj.stack : undefined
      }
    }
  }
  
  /**
   * 安全执行处理器，自动捕获异常
   */
  protected async safeHandle<T>(
    handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T>
  ): Promise<(event: IpcMainInvokeEvent, ...args: any[]) => Promise<IpcResponse<T>>> {
    return async (event: IpcMainInvokeEvent, ...args: any[]) => {
      try {
        const result = await handler(event, ...args)
        return this.wrapResponse(result)
      } catch (error) {
        console.error(`[IPC Handler] Error in ${this.namespace}:`, error)
        return this.wrapError(error as Error)
      }
    }
  }
}
```

#### 5. 系统信息处理器示例

```typescript
// src/main/ipc/handlers/system.handler.ts
import { ipcMain, IpcMainInvokeEvent, app } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import os from 'os'

export class SystemHandler extends IpcHandler {
  readonly namespace = 'system'
  
  register(): void {
    // 获取系统信息
    ipcMain.handle(
      IPC_CHANNELS.SYSTEM_INFO,
      await this.safeHandle(this.getSystemInfo.bind(this))
    )
    
    // 获取平台信息
    ipcMain.handle(
      IPC_CHANNELS.SYSTEM_PLATFORM,
      await this.safeHandle(this.getPlatform.bind(this))
    )
  }
  
  private async getSystemInfo(_event: IpcMainInvokeEvent): Promise<SystemInfo> {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      hostname: os.hostname(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().length
    }
  }
  
  private async getPlatform(_event: IpcMainInvokeEvent): Promise<string> {
    return process.platform
  }
}

interface SystemInfo {
  platform: string
  arch: string
  version: string
  electronVersion: string
  nodeVersion: string
  chromeVersion: string
  hostname: string
  totalMemory: number
  freeMemory: number
  cpus: number
}
```

#### 6. 测试处理器

```typescript
// src/main/ipc/handlers/test.handler.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'

export class TestHandler extends IpcHandler {
  readonly namespace = 'test'
  
  register(): void {
    // Ping-Pong 测试
    ipcMain.handle(
      IPC_CHANNELS.TEST_PING,
      await this.safeHandle(this.ping.bind(this))
    )
    
    // Echo 测试
    ipcMain.handle(
      IPC_CHANNELS.TEST_ECHO,
      await this.safeHandle(this.echo.bind(this))
    )
  }
  
  private async ping(_event: IpcMainInvokeEvent): Promise<string> {
    return 'pong'
  }
  
  private async echo(_event: IpcMainInvokeEvent, message: string): Promise<string> {
    return message
  }
}
```

#### 7. IPC 处理器注册中心

```typescript
// src/main/ipc/index.ts
import { IpcHandler } from './handler'
import { SystemHandler } from './handlers/system.handler'
import { TestHandler } from './handlers/test.handler'

export class IpcManager {
  private handlers: IpcHandler[] = []
  
  /**
   * 初始化所有 IPC 处理器
   */
  initialize(): void {
    // 注册所有处理器
    this.handlers = [
      new SystemHandler(),
      new TestHandler()
    ]
    
    // 注册每个处理器
    this.handlers.forEach(handler => {
      console.log(`[IPC] Registering handler: ${handler.namespace}`)
      handler.register()
    })
    
    console.log(`[IPC] Initialized ${this.handlers.length} handlers`)
  }
  
  /**
   * 清理所有处理器
   */
  cleanup(): void {
    // 移除所有监听器
    this.handlers = []
    console.log('[IPC] Cleaned up all handlers')
  }
}

// 导出单例
export const ipcManager = new IpcManager()
```

#### 8. 主进程集成

```typescript
// src/main/index.ts
import { app } from 'electron'
import { createMainWindow } from './window'
import { ipcManager } from './ipc'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  // 初始化 IPC
  ipcManager.initialize()
  
  // 创建窗口
  mainWindow = createMainWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ipcManager.cleanup()
    app.quit()
  }
})
```

### 数据模型

本任务主要涉及 IPC 通信协议，不涉及持久化数据模型。

### API 规范

#### 渲染进程 API

```typescript
// 调用主进程方法（双向通信）
const result = await window.api.invoke<RequestData, ResponseData>(channel, data)

// 发送消息到主进程（单向通信）
window.api.send(channel, ...args)

// 监听主进程事件
const unsubscribe = window.api.on(channel, (data) => {
  console.log('Received:', data)
})

// 取消监听
unsubscribe()
```

#### 主进程 Handler API

```typescript
// 注册 invoke 处理器
ipcMain.handle(channel, async (event, data) => {
  return await handler(data)
})

// 发送事件到渲染进程
mainWindow.webContents.send(channel, data)
```

## 验收标准

### 功能完整性

- [ ] 渲染进程能通过 `window.api.invoke('test:ping')` 调用主进程并收到 'pong' 响应
- [ ] 渲染进程能通过 `window.api.invoke('test:echo', 'hello')` 调用主进程并收到 'hello' 响应
- [ ] 渲染进程能通过 `window.api.invoke('system:info')` 获取系统信息
- [ ] 主进程抛出异常时，渲染进程能捕获到错误信息
- [ ] 渲染进程尝试调用未授权通道时，抛出明确的错误
- [ ] 主进程能向渲染进程发送事件通知
- [ ] 渲染进程能正确订阅和取消订阅事件

### 性能指标

- [ ] IPC 调用延迟 < 50ms（本地调用，不含业务逻辑）
- [ ] 支持并发 IPC 调用，无阻塞
- [ ] 内存泄漏检查通过（事件监听器正确清理）

### 用户体验

- [ ] 错误信息清晰易懂，包含错误代码和描述
- [ ] 开发环境下显示详细的调用日志
- [ ] 生产环境下不暴露敏感的堆栈信息

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] 所有公共 API 有 JSDoc 注释
- [ ] 通道名称使用常量，避免硬编码字符串
- [ ] 错误处理完整，无未捕获异常
- [ ] 代码符合 ESLint 规则

## 测试标准

### 单元测试

**测试场景 1：Preload API 暴露**
```typescript
describe('Preload API', () => {
  it('should expose api object to window', () => {
    expect(window.api).toBeDefined()
    expect(window.api.invoke).toBeInstanceOf(Function)
    expect(window.api.send).toBeInstanceOf(Function)
    expect(window.api.on).toBeInstanceOf(Function)
  })
  
  it('should reject unauthorized channels', async () => {
    await expect(
      window.api.invoke('unauthorized:channel')
    ).rejects.toThrow('IPC channel not allowed')
  })
})
```

**测试场景 2：IPC Handler**
```typescript
describe('TestHandler', () => {
  it('should return pong for ping', async () => {
    const result = await window.api.invoke('test:ping')
    expect(result).toBe('pong')
  })
  
  it('should echo message', async () => {
    const message = 'hello world'
    const result = await window.api.invoke('test:echo', message)
    expect(result).toBe(message)
  })
})
```

**测试场景 3：错误处理**
```typescript
describe('Error Handling', () => {
  it('should wrap errors correctly', async () => {
    try {
      await window.api.invoke('test:error')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBeTruthy()
    }
  })
})
```

### 集成测试

**测试场景：端到端 IPC 通信**
1. 启动 Electron 应用
2. 渲染进程调用 `window.api.invoke('system:info')`
3. 验证返回的系统信息包含所有必需字段
4. 验证响应时间 < 50ms

### 端到端测试

暂不要求 E2E 测试，将在 TASK013 集成测试阶段补充。

## 依赖关系

### 前置依赖

- [PHASE0-TASK001](phase0-task001_electron-scaffold.md) - Electron 应用脚手架搭建

### 被依赖任务

- TASK003 - 基础 UI 框架集成
- TASK008 - 文件管理器实现
- TASK010 - Git 抽象层基础实现
- 所有需要主进程与渲染进程通信的功能

### 阻塞风险

- Electron contextBridge API 变更（低风险，API 稳定）
- TypeScript 类型推导复杂度（中风险，需要仔细设计类型系统）

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| contextBridge 性能问题 | 中 | 低 | 避免传递大对象，使用流式传输 |
| 类型定义过于复杂 | 低 | 中 | 使用泛型简化，提供默认类型 |
| 通道名称冲突 | 中 | 低 | 使用命名空间前缀，集中管理常量 |
| 内存泄漏（事件监听器） | 高 | 中 | 提供取消订阅机制，自动清理 |

### 时间风险

- 类型系统设计可能需要多次迭代
- 错误处理边界情况较多，需要充分测试

### 资源风险

- 需要熟悉 Electron IPC 机制的开发者
- 需要理解 TypeScript 高级类型特性

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构（第 3.2 节：进程通信架构）
- [`specs/requirements/phase0/infrastructure-setup.md`](../../requirements/phase0/infrastructure-setup.md) - 需求 2.2
- [Electron IPC 官方文档](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron contextBridge 文档](https://www.electronjs.org/docs/latest/api/context-bridge)

## 实施计划

### 第1步：设计类型系统

- 定义 IPC 通道常量
- 定义请求/响应类型
- 定义 API 接口类型
- 预计耗时：2 小时

### 第2步：实现 Preload 脚本

- 实现 contextBridge API 暴露
- 实现通道白名单验证
- 实现错误处理
- 预计耗时：3 小时

### 第3步：实现主进程 Handler 框架

- 实现 IpcHandler 基类
- 实现响应包装和错误处理
- 实现 IpcManager 注册中心
- 预计耗时：3 小时

### 第4步：实现测试处理器

- 实现 TestHandler（ping/echo）
- 实现 SystemHandler（系统信息）
- 集成到主进程
- 预计耗时：2 小时

### 第5步：编写单元测试

- 测试 Preload API
- 测试 Handler 逻辑
- 测试错误处理
- 预计耗时：3 小时

### 第6步：文档和示例

- 编写 API 使用文档
- 编写 Handler 开发指南
- 创建示例代码
- 预计耗时：2 小时

## 完成标准

**本任务完成的标志：**

1. 渲染进程能通过 `window.api` 安全调用主进程方法
2. 所有测试用例通过
3. TypeScript 类型检查无错误
4. 文档完整，包含使用示例和开发指南
5. 代码审查通过，符合项目规范

**交付物：**

- [ ] 完整的 IPC 框架代码
- [ ] Preload 脚本和类型定义
- [ ] 主进程 Handler 框架
- [ ] 测试处理器（TestHandler, SystemHandler）
- [ ] 单元测试代码
- [ ] API 使用文档
- [ ] Handler 开发指南

## 备注

### 开发建议

1. 优先实现最小可用版本，后续迭代优化
2. 通道名称使用常量，便于重构和维护
3. 错误信息要清晰，便于调试
4. 考虑未来扩展性，预留扩展点

### 已知问题

- contextBridge 不支持传递函数，需要使用回调模式
- 大对象传递可能影响性能，考虑使用流式传输或分块传输

### 后续优化方向

- 实现请求超时机制
- 实现请求取消功能
- 实现请求队列和优先级
- 实现性能监控和日志

---

**创建时间：** 2026-03-01  
**最后更新：** 2026-03-01  
**更新记录：**
- 2026-03-01 - 初始创建
