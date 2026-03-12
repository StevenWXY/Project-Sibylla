# Phase0-Task008 第5步：IPC 集成架构图

## 整体架构

```mermaid
graph TB
    subgraph Renderer["渲染进程 (Renderer Process)"]
        UI[React UI 组件]
        API[window.electronAPI.file.*]
    end
    
    subgraph Preload["Preload 脚本 (Isolated Context)"]
        SafeInvoke[safeInvoke 包装器]
        ContextBridge[contextBridge]
        Whitelist[通道白名单验证]
    end
    
    subgraph Main["主进程 (Main Process)"]
        IpcManager[IpcManager]
        FileHandler[FileHandler]
        FileManager[FileManager]
        FileWatcher[FileWatcher]
        FS[Node.js fs/promises]
        Chokidar[chokidar]
    end
    
    UI -->|调用| API
    API -->|IPC invoke| SafeInvoke
    SafeInvoke -->|验证| Whitelist
    Whitelist -->|contextBridge| ContextBridge
    ContextBridge -->|ipcRenderer.invoke| IpcManager
    IpcManager -->|路由| FileHandler
    FileHandler -->|调用| FileManager
    FileManager -->|文件操作| FS
    FileManager -->|监控| FileWatcher
    FileWatcher -->|监听| Chokidar
    FileWatcher -.->|事件推送| FileHandler
    FileHandler -.->|webContents.send| ContextBridge
    ContextBridge -.->|事件回调| API
    API -.->|更新| UI
    
    style Renderer fill:#e1f5ff
    style Preload fill:#fff4e1
    style Main fill:#e8f5e9
```

## IPC 通道流程

### 1. 文件读取流程

```mermaid
sequenceDiagram
    participant UI as React 组件
    participant API as electronAPI.file
    participant Preload as Preload Script
    participant Handler as FileHandler
    participant Manager as FileManager
    participant FS as fs/promises
    
    UI->>API: readFile('docs/readme.md')
    API->>Preload: safeInvoke('file:read', ...)
    Preload->>Preload: 验证通道白名单
    Preload->>Preload: 添加超时保护
    Preload->>Handler: ipcRenderer.invoke('file:read')
    Handler->>Handler: safeHandle() 包装
    Handler->>Manager: fileManager.readFile()
    Manager->>Manager: 路径验证
    Manager->>FS: fs.readFile()
    FS-->>Manager: 文件内容
    Manager-->>Handler: FileContent
    Handler-->>Handler: wrapResponse()
    Handler-->>Preload: IPCResponse<FileContent>
    Preload-->>API: 返回响应
    API-->>UI: 文件内容
```

### 2. 文件监控流程

```mermaid
sequenceDiagram
    participant UI as React 组件
    participant API as electronAPI.file
    participant Preload as Preload Script
    participant Handler as FileHandler
    participant Manager as FileManager
    participant Watcher as FileWatcher
    participant Chokidar as chokidar
    
    UI->>API: startWatching()
    API->>Preload: safeInvoke('file:watch:start')
    Preload->>Handler: ipcRenderer.invoke()
    Handler->>Manager: startWatching(callback)
    Manager->>Watcher: watcher.start()
    Watcher->>Chokidar: chokidar.watch()
    
    Note over Chokidar: 文件系统变化
    
    Chokidar-->>Watcher: 'change' 事件
    Watcher-->>Manager: callback(event)
    Manager-->>Handler: 事件回调
    Handler-->>Preload: webContents.send('file:watch:event')
    Preload-->>API: ipcRenderer.on() 触发
    API-->>UI: onFileChange(event)
    UI->>UI: 更新 UI
```

## 数据流转换

### 类型转换链

```mermaid
graph LR
    subgraph Renderer
        A1[用户输入]
        A2[TypeScript 类型]
    end
    
    subgraph Preload
        B1[IPC 请求参数]
        B2[序列化]
    end
    
    subgraph Main
        C1[IPC 事件参数]
        C2[业务对象]
        C3[FileManager 类型]
    end
    
    subgraph Response
        D1[FileManager 返回值]
        D2[IPCResponse 包装]
        D3[序列化响应]
        D4[渲染进程接收]
    end
    
    A1 --> A2
    A2 --> B1
    B1 --> B2
    B2 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4
```

### Date 对象序列化

```typescript
// FileManager 返回
{
  modifiedTime: Date,  // Date 对象
  createdTime: Date
}

// IPC 传输（自动序列化）
{
  modifiedTime: "2026-03-12T11:15:00.000Z",  // ISO 8601 字符串
  createdTime: "2026-03-12T10:00:00.000Z"
}

// 渲染进程接收
{
  modifiedTime: string,  // 需要手动转换为 Date
  createdTime: string
}
```

## 错误处理流程

```mermaid
graph TB
    Start[IPC 调用开始]
    
    Start --> Timeout{超时?}
    Timeout -->|是| TimeoutError[返回超时错误]
    Timeout -->|否| Invoke[执行 IPC 调用]
    
    Invoke --> Handler{Handler 执行}
    Handler -->|成功| Success[wrapResponse]
    Handler -->|异常| Catch[safeHandle 捕获]
    
    Catch --> Infer[inferErrorType]
    Infer --> ErrorMap{错误类型映射}
    
    ErrorMap -->|ENOENT| FileNotFound[FILE_NOT_FOUND]
    ErrorMap -->|EACCES| PermissionDenied[PERMISSION_DENIED]
    ErrorMap -->|其他| IpcError[IPC_ERROR]
    
    FileNotFound --> WrapError[wrapError]
    PermissionDenied --> WrapError
    IpcError --> WrapError
    TimeoutError --> WrapError
    
    WrapError --> Response[IPCResponse<error>]
    Success --> Response
    
    Response --> Return[返回渲染进程]
    
    style TimeoutError fill:#ffcdd2
    style FileNotFound fill:#ffcdd2
    style PermissionDenied fill:#ffcdd2
    style IpcError fill:#ffcdd2
    style Success fill:#c8e6c9
```

## 安全边界

```mermaid
graph TB
    subgraph Untrusted["不可信区域 (Renderer)"]
        UserInput[用户输入]
        WebContent[Web 内容]
    end
    
    subgraph Boundary["安全边界 (Preload)"]
        Whitelist[通道白名单]
        Validation[参数验证]
        ContextBridge[contextBridge 隔离]
    end
    
    subgraph Trusted["可信区域 (Main)"]
        PathValidation[路径验证]
        FileSystem[文件系统访问]
        SystemResources[系统资源]
    end
    
    UserInput --> Whitelist
    WebContent --> Whitelist
    Whitelist -->|允许| Validation
    Whitelist -.->|拒绝| Reject[拒绝访问]
    Validation --> ContextBridge
    ContextBridge --> PathValidation
    PathValidation -->|合法| FileSystem
    PathValidation -.->|非法| Error[抛出错误]
    FileSystem --> SystemResources
    
    style Untrusted fill:#ffebee
    style Boundary fill:#fff9c4
    style Trusted fill:#e8f5e9
    style Reject fill:#ffcdd2
    style Error fill:#ffcdd2
```

## 性能优化点

### 1. IPC 调用优化

```mermaid
graph LR
    A[批量操作] --> B[减少 IPC 调用次数]
    C[缓存结果] --> D[避免重复查询]
    E[异步处理] --> F[不阻塞主线程]
    G[超时保护] --> H[防止长时间等待]
    
    B --> Performance[性能提升]
    D --> Performance
    F --> Performance
    H --> Performance
```

### 2. 文件监控优化

```mermaid
graph TB
    A[chokidar 配置]
    A --> B[防抖机制<br/>awaitWriteFinish]
    A --> C[忽略模式<br/>ignored patterns]
    A --> D[初始扫描<br/>ignoreInitial]
    
    B --> E[减少事件频率]
    C --> F[减少监控范围]
    D --> G[加快启动速度]
    
    E --> H[降低 CPU 使用]
    F --> H
    G --> H
```

## 扩展性设计

### 未来支持的功能

```mermaid
graph TB
    Current[当前实现<br/>基础文件操作]
    
    Current --> Future1[大文件分片传输]
    Current --> Future2[文件搜索]
    Current --> Future3[批量操作]
    Current --> Future4[进度回调]
    
    Future1 --> Phase1[Phase 1]
    Future2 --> Phase1
    Future3 --> Phase1
    Future4 --> Phase1
    
    style Current fill:#c8e6c9
    style Phase1 fill:#e1f5ff
```

---

**创建时间**: 2026-03-12  
**用途**: 可视化 IPC 集成架构，辅助开发和代码审查
