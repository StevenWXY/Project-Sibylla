# FileManager 重构架构图

## 系统架构概览

```mermaid
graph TB
    subgraph "用户层"
        UI[UI Components]
        IPC[IPC Handlers]
    end
    
    subgraph "服务层"
        WM[WorkspaceManager]
        FM[FileManager]
    end
    
    subgraph "文件系统"
        FS[File System]
        SYS[System Directories<br/>.sibylla, .git, etc.]
        USER[User Files<br/>docs, skills, etc.]
    end
    
    UI -->|用户操作| IPC
    IPC -->|USER context| WM
    IPC -->|USER context| FM
    WM -->|SYSTEM context| FM
    FM -->|验证 + 操作| FS
    FS --> SYS
    FS --> USER
    
    style FM fill:#e1f5ff
    style WM fill:#fff4e1
    style SYS fill:#ffe1e1
    style USER fill:#e1ffe1
```

## FileOperationContext 流程

```mermaid
graph LR
    subgraph "操作上下文"
        USER_CTX[USER Context<br/>用户操作]
        WORKSPACE_CTX[WORKSPACE_INIT Context<br/>Workspace 初始化]
        SYSTEM_CTX[SYSTEM Context<br/>系统操作]
    end
    
    subgraph "路径验证"
        CHECK_TRAVERSAL[检查路径遍历]
        CHECK_FORBIDDEN[检查禁止路径]
        CHECK_SIBYLLA[检查 .sibylla 访问]
        ALLOW[允许访问]
    end
    
    USER_CTX --> CHECK_TRAVERSAL
    WORKSPACE_CTX --> CHECK_TRAVERSAL
    SYSTEM_CTX --> CHECK_TRAVERSAL
    
    CHECK_TRAVERSAL -->|通过| CHECK_FORBIDDEN
    CHECK_TRAVERSAL -->|失败| REJECT[拒绝访问]
    
    CHECK_FORBIDDEN -->|USER| REJECT_ALL[拒绝所有系统目录]
    CHECK_FORBIDDEN -->|WORKSPACE_INIT| CHECK_SIBYLLA
    CHECK_FORBIDDEN -->|SYSTEM| ALLOW
    
    CHECK_SIBYLLA -->|.sibylla 路径| ALLOW
    CHECK_SIBYLLA -->|其他系统路径| REJECT_ALL
    
    REJECT_ALL --> REJECT
    
    style USER_CTX fill:#ffe1e1
    style WORKSPACE_CTX fill:#fff4e1
    style SYSTEM_CTX fill:#e1ffe1
    style REJECT fill:#ff0000,color:#fff
    style ALLOW fill:#00ff00,color:#000
```

## 安全层级

```mermaid
graph TB
    subgraph "安全层级从高到低"
        L1[Level 1: USER Context<br/>最严格限制<br/>禁止访问所有系统目录]
        L2[Level 2: WORKSPACE_INIT Context<br/>中等限制<br/>只允许访问 .sibylla]
        L3[Level 3: SYSTEM Context<br/>最少限制<br/>允许访问所有目录<br/>需要审计日志]
    end
    
    L1 -->|降低限制| L2
    L2 -->|降低限制| L3
    
    style L1 fill:#ff6b6b
    style L2 fill:#ffd93d
    style L3 fill:#6bcf7f
```

## 典型使用场景

### 场景 1: 用户编辑文档

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant IPC as IPC Handler
    participant FM as FileManager
    participant FS as File System
    
    UI->>IPC: 编辑 docs/readme.md
    IPC->>FM: writeFile('docs/readme.md')<br/>context: USER (默认)
    FM->>FM: validatePath()<br/>检查禁止路径
    FM->>FS: 写入文件
    FS-->>FM: 成功
    FM-->>IPC: 成功
    IPC-->>UI: 成功
```

### 场景 2: 用户尝试编辑系统文件（被拒绝）

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant IPC as IPC Handler
    participant FM as FileManager
    
    UI->>IPC: 编辑 .sibylla/config.json
    IPC->>FM: writeFile('.sibylla/config.json')<br/>context: USER (默认)
    FM->>FM: validatePath()<br/>检测到禁止路径
    FM-->>IPC: ❌ ACCESS_FORBIDDEN
    IPC-->>UI: 错误提示
```

### 场景 3: WorkspaceManager 创建 Workspace

```mermaid
sequenceDiagram
    participant WM as WorkspaceManager
    participant FM as FileManager
    participant FS as File System
    participant LOG as Logger
    
    WM->>FM: createDirectory('.sibylla')<br/>context: SYSTEM
    FM->>LOG: 记录系统级操作
    FM->>FM: validatePath()<br/>SYSTEM context 跳过禁止路径检查
    FM->>FS: 创建目录
    FS-->>FM: 成功
    FM-->>WM: 成功
    
    WM->>FM: writeFile('.sibylla/config.json')<br/>context: SYSTEM
    FM->>LOG: 记录系统级操作
    FM->>FS: 写入文件
    FS-->>FM: 成功
    FM-->>WM: 成功
```

## 代码结构

```mermaid
classDiagram
    class FileOperationContext {
        <<enumeration>>
        USER
        WORKSPACE_INIT
        SYSTEM
    }
    
    class FileOperationOptions {
        +context?: FileOperationContext
    }
    
    class WriteFileOptions {
        +encoding?: string
        +atomic?: boolean
    }
    
    class FileManager {
        -workspaceRoot: string
        -customForbiddenPaths: string[]
        +validatePath(fullPath, context)
        -checkForbiddenPaths(fullPath)
        -checkWorkspaceInitPaths(fullPath)
        +writeFile(path, content, options)
        +readFile(path, options)
        +createDirectory(path, options)
    }
    
    class WorkspaceManager {
        -fileManager: FileManager
        +createWorkspace(options)
        -createDirectoryStructure(path)
        -writeConfig(path, config)
    }
    
    FileOperationOptions <|-- WriteFileOptions
    FileOperationOptions o-- FileOperationContext
    FileManager ..> FileOperationContext : uses
    FileManager ..> FileOperationOptions : uses
    WorkspaceManager --> FileManager : uses with SYSTEM context
```

## 安全检查流程

```mermaid
flowchart TD
    START([文件操作请求]) --> GET_CONTEXT{获取 Context}
    
    GET_CONTEXT -->|未指定| DEFAULT[默认: USER]
    GET_CONTEXT -->|指定| USE_CONTEXT[使用指定 Context]
    
    DEFAULT --> CHECK1
    USE_CONTEXT --> CHECK1
    
    CHECK1[检查 1: 路径遍历攻击] --> TRAVERSAL_OK{通过?}
    TRAVERSAL_OK -->|否| REJECT1[拒绝: PATH_OUTSIDE_WORKSPACE]
    TRAVERSAL_OK -->|是| CHECK2
    
    CHECK2{Context 类型?}
    CHECK2 -->|USER| CHECK_USER[检查所有禁止路径]
    CHECK2 -->|WORKSPACE_INIT| CHECK_WORKSPACE[检查 .sibylla 访问]
    CHECK2 -->|SYSTEM| LOG_SYSTEM[记录审计日志]
    
    CHECK_USER --> FORBIDDEN_USER{访问禁止路径?}
    FORBIDDEN_USER -->|是| REJECT2[拒绝: ACCESS_FORBIDDEN]
    FORBIDDEN_USER -->|否| CHECK3
    
    CHECK_WORKSPACE --> IS_SIBYLLA{是 .sibylla 路径?}
    IS_SIBYLLA -->|是| CHECK3
    IS_SIBYLLA -->|否| CHECK_USER
    
    LOG_SYSTEM --> CHECK3
    
    CHECK3[检查 3: 路径长度] --> LENGTH_OK{通过?}
    LENGTH_OK -->|否| REJECT3[拒绝: PATH_TOO_LONG]
    LENGTH_OK -->|是| ALLOW[允许操作]
    
    ALLOW --> EXECUTE[执行文件操作]
    EXECUTE --> END([完成])
    
    REJECT1 --> END
    REJECT2 --> END
    REJECT3 --> END
    
    style START fill:#e1f5ff
    style END fill:#e1f5ff
    style ALLOW fill:#c8e6c9
    style REJECT1 fill:#ffcdd2
    style REJECT2 fill:#ffcdd2
    style REJECT3 fill:#ffcdd2
    style LOG_SYSTEM fill:#fff9c4
```

## 测试覆盖矩阵

| Context | 路径类型 | 预期结果 | 测试用例 |
|---------|---------|---------|---------|
| USER | docs/readme.md | ✅ 允许 | ✓ |
| USER | .sibylla/config.json | ❌ 拒绝 | ✓ |
| USER | .git/config | ❌ 拒绝 | ✓ |
| USER | node_modules/pkg/index.js | ❌ 拒绝 | ✓ |
| WORKSPACE_INIT | .sibylla/config.json | ✅ 允许 | ✓ |
| WORKSPACE_INIT | .sibylla/index/data.json | ✅ 允许 | ✓ |
| WORKSPACE_INIT | .git/config | ❌ 拒绝 | ✓ |
| WORKSPACE_INIT | docs/readme.md | ✅ 允许 | ✓ |
| SYSTEM | .sibylla/config.json | ✅ 允许 + 日志 | ✓ |
| SYSTEM | .git/config | ✅ 允许 + 日志 | ✓ |
| SYSTEM | docs/readme.md | ✅ 允许 + 日志 | ✓ |
| (默认) | docs/readme.md | ✅ 允许 | ✓ |
| (默认) | .sibylla/config.json | ❌ 拒绝 | ✓ |

## 审计日志示例

```typescript
// SYSTEM context 操作会生成如下日志
{
  level: 'warn',
  message: '[FileManager] System-level operation',
  context: 'SYSTEM',
  path: '/workspace/.sibylla/config.json',
  operation: 'writeFile',
  timestamp: '2026-03-13T13:45:00.000Z',
  stack: 'Error\n    at FileManager.validatePath (...)\n    at WorkspaceManager.writeConfig (...)'
}
```

## 迁移路径

### 阶段 1: 类型定义（当前）
- 添加 `FileOperationContext` 枚举
- 添加 `FileOperationOptions` 接口

### 阶段 2: FileManager 重构
- 修改 `validatePath()` 支持 context
- 更新所有文件操作方法签名
- 添加审计日志

### 阶段 3: WorkspaceManager 重构
- 移除直接 fs 调用
- 使用 FileManager with SYSTEM context

### 阶段 4: 测试和验证
- 单元测试
- 集成测试
- 手动测试

### 阶段 5: 文档和发布
- 更新 API 文档
- 更新使用指南
- 代码审查

---

**创建时间:** 2026-03-13  
**最后更新:** 2026-03-13
