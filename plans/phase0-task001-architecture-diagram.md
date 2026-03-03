# Phase 0 Task 001 - 架构可视化

## 系统架构图

### 1. Electron 应用整体架构

```mermaid
graph TB
    subgraph Electron应用
        Main[主进程<br/>Main Process<br/>Node.js环境]
        Preload[Preload脚本<br/>桥接层]
        Renderer[渲染进程<br/>Renderer Process<br/>Chromium环境]
        
        Main -->|创建窗口| Renderer
        Main -->|注入| Preload
        Preload -->|contextBridge| Renderer
    end
    
    subgraph 开发工具
        Vite[Vite开发服务器<br/>HMR支持]
        TSC[TypeScript编译器<br/>类型检查]
        ESLint[ESLint<br/>代码检查]
    end
    
    subgraph 构建工具
        ViteBuild[Vite构建<br/>Rollup打包]
        ElectronBuilder[electron-builder<br/>应用打包]
    end
    
    Vite -.->|开发模式| Renderer
    ViteBuild -->|生产构建| Main
    ViteBuild -->|生产构建| Renderer
    ViteBuild -->|生产构建| Preload
    ElectronBuilder -->|打包| Main
    ElectronBuilder -->|打包| Renderer
    ElectronBuilder -->|打包| Preload
```

### 2. 进程通信架构

```mermaid
sequenceDiagram
    participant R as 渲染进程<br/>React UI
    participant P as Preload脚本<br/>contextBridge
    participant M as 主进程<br/>IPC Handler
    participant S as 系统服务<br/>FileManager/Git
    
    R->>P: window.electronAPI.ping()
    P->>M: ipcRenderer.invoke('test:ping')
    M->>M: ipcMain.handle('test:ping')
    M->>S: 调用系统服务
    S-->>M: 返回结果
    M-->>P: Promise resolve
    P-->>R: 返回数据
    
    Note over R,S: 所有通信都通过 IPC 安全通道
    Note over P: contextIsolation=true<br/>nodeIntegration=false
```

### 3. 开发流程架构

```mermaid
graph LR
    subgraph 开发环境
        Dev[npm run dev]
        ViteDev[Vite Dev Server<br/>:5173]
        ElectronDev[Electron进程<br/>--inspect=5858]
        
        Dev -->|启动| ViteDev
        Dev -->|等待Vite就绪| ElectronDev
        ViteDev -->|HMR| ElectronDev
    end
    
    subgraph 开发者工具
        DevTools[Chrome DevTools<br/>渲染进程调试]
        NodeInspector[Node Inspector<br/>主进程调试]
        
        ElectronDev -->|打开| DevTools
        ElectronDev -->|连接| NodeInspector
    end
    
    style ViteDev fill:#41b883
    style ElectronDev fill:#47848f
```

### 4. 构建流程架构

```mermaid
graph TB
    Start[npm run build] --> BuildRenderer[构建渲染进程<br/>vite build]
    BuildRenderer --> BuildMain[构建主进程<br/>vite build --config vite.main.config.ts]
    BuildMain --> BuildPreload[构建Preload<br/>vite build --config vite.preload.config.ts]
    BuildPreload --> TypeCheck[类型检查<br/>tsc --noEmit]
    TypeCheck --> Lint[代码检查<br/>eslint]
    Lint --> Package[打包应用<br/>electron-builder]
    
    Package --> Mac[Mac DMG/ZIP]
    Package --> Win[Windows NSIS/Portable]
    
    subgraph 构建产物
        Mac
        Win
    end
    
    style Start fill:#4CAF50
    style Package fill:#FF9800
    style Mac fill:#2196F3
    style Win fill:#2196F3
```

### 5. 文件系统架构

```mermaid
graph TB
    Root[sibylla-desktop/]
    
    Root --> Src[src/]
    Root --> Resources[resources/]
    Root --> Build[build/]
    Root --> Dist[dist/]
    Root --> Config[配置文件]
    
    Src --> Main[main/<br/>主进程代码]
    Src --> Renderer[renderer/<br/>渲染进程代码]
    Src --> Preload[preload/<br/>Preload脚本]
    Src --> Shared[shared/<br/>共享类型]
    
    Main --> MainIndex[index.ts<br/>应用入口]
    Main --> Window[window.ts<br/>窗口管理]
    Main --> IPC[ipc/<br/>IPC处理器]
    Main --> Services[services/<br/>业务服务]
    
    Renderer --> HTML[index.html]
    Renderer --> MainTSX[main.tsx<br/>React入口]
    Renderer --> AppTSX[App.tsx<br/>根组件]
    Renderer --> Components[components/<br/>UI组件]
    Renderer --> Styles[styles/<br/>样式文件]
    
    Config --> TSConfig[tsconfig.json<br/>TS配置]
    Config --> ViteConfig[vite.config.ts<br/>Vite配置]
    Config --> ESLintConfig[.eslintrc.json<br/>ESLint配置]
    Config --> BuilderConfig[electron-builder.json<br/>打包配置]
    
    style Root fill:#FFF3E0
    style Src fill:#E3F2FD
    style Main fill:#C8E6C9
    style Renderer fill:#F8BBD0
    style Preload fill:#FFCCBC
```

### 6. 技术栈依赖关系

```mermaid
graph LR
    subgraph 运行时
        Electron[Electron 28<br/>跨平台框架]
        Chromium[Chromium 120<br/>渲染引擎]
        Node[Node.js 18<br/>运行时]
        
        Electron --> Chromium
        Electron --> Node
    end
    
    subgraph UI层
        React[React 18<br/>UI框架]
        TailwindCSS[TailwindCSS 3<br/>样式框架]
        
        React --> Chromium
        TailwindCSS --> Chromium
    end
    
    subgraph 开发工具
        TypeScript[TypeScript 5.3<br/>类型系统]
        Vite[Vite 5<br/>构建工具]
        ESLint[ESLint 8<br/>代码检查]
        Prettier[Prettier 3<br/>代码格式化]
        
        TypeScript --> React
        TypeScript --> Node
        Vite --> React
        Vite --> TypeScript
    end
    
    subgraph 打包工具
        ElectronBuilder[electron-builder 24<br/>应用打包]
        
        ElectronBuilder --> Electron
    end
    
    style Electron fill:#47848f
    style React fill:#61dafb
    style TypeScript fill:#3178c6
    style Vite fill:#646cff
```

### 7. 安全架构

```mermaid
graph TB
    subgraph 渲染进程安全边界
        UI[React UI<br/>用户界面]
        Window[window对象<br/>受限环境]
        API[window.electronAPI<br/>暴露的API]
    end
    
    subgraph 安全隔离层
        ContextBridge[contextBridge<br/>安全桥接]
        Preload[Preload脚本<br/>受信任代码]
    end
    
    subgraph 主进程特权区
        IPC[IPC处理器<br/>权限验证]
        Services[系统服务<br/>文件/Git/数据库]
        NodeAPI[Node.js API<br/>完整权限]
    end
    
    UI -->|调用| API
    API -->|通过| ContextBridge
    ContextBridge -->|注入| Preload
    Preload -->|ipcRenderer.invoke| IPC
    IPC -->|调用| Services
    Services -->|使用| NodeAPI
    
    Note1[contextIsolation: true<br/>nodeIntegration: false<br/>sandbox: true]
    
    style UI fill:#E8F5E9
    style ContextBridge fill:#FFF9C4
    style IPC fill:#FFCCBC
    style Services fill:#FFCDD2
```

### 8. 数据流架构

```mermaid
graph LR
    subgraph 用户交互
        User[用户操作]
        UI[React组件]
    end
    
    subgraph 状态管理
        State[组件状态<br/>useState/useEffect]
        Store[全局状态<br/>Zustand预留]
    end
    
    subgraph IPC通信
        API[electronAPI]
        IPC[IPC通道]
    end
    
    subgraph 主进程服务
        Handler[IPC处理器]
        Service[业务服务]
        FS[文件系统]
        Git[Git操作]
    end
    
    User -->|点击/输入| UI
    UI -->|更新| State
    State -->|触发| API
    API -->|invoke| IPC
    IPC -->|路由| Handler
    Handler -->|调用| Service
    Service -->|读写| FS
    Service -->|操作| Git
    
    Git -.->|结果| Service
    FS -.->|结果| Service
    Service -.->|返回| Handler
    Handler -.->|响应| IPC
    IPC -.->|Promise| API
    API -.->|更新| State
    State -.->|重渲染| UI
    
    style User fill:#4CAF50
    style UI fill:#2196F3
    style API fill:#FF9800
    style Service fill:#9C27B0
```

---

## 关键设计决策

### 1. 进程隔离策略

**决策：** 严格的进程隔离，禁用 nodeIntegration

**理由：**
- 防止渲染进程直接访问 Node.js API
- 降低 XSS 攻击风险
- 符合 Electron 安全最佳实践

**实现：**
```typescript
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

### 2. 构建工具选择

**决策：** 使用 Vite 替代 Webpack

**理由：**
- 开发服务器启动速度快（基于 ESM）
- HMR 响应速度快
- 配置简洁
- TypeScript 开箱即用

**权衡：**
- 优势：开发体验好，构建速度快
- 劣势：生态相对 Webpack 较新
- 结论：适合现代化项目

### 3. TypeScript 严格模式

**决策：** 启用所有严格检查选项

**理由：**
- 提前发现类型错误
- 提升代码质量
- 更好的 IDE 支持

**配置：**
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```

### 4. 目录结构设计

**决策：** 按进程类型划分目录

**理由：**
- 清晰的职责划分
- 便于独立构建
- 符合 Electron 架构

**结构：**
```
src/
├── main/      # 主进程（Node.js）
├── renderer/  # 渲染进程（Chromium）
├── preload/   # Preload（桥接层）
└── shared/    # 共享类型
```

---

## 性能优化策略

### 1. 开发环境优化

- Vite 开发服务器（快速启动）
- HMR 热模块替换（快速更新）
- TypeScript 增量编译
- ESLint 缓存

### 2. 生产环境优化

- 代码分割（manualChunks）
- Tree Shaking（移除未使用代码）
- 压缩（esbuild minify）
- 资源内联（小于 4KB）

### 3. 应用启动优化

- 延迟加载非关键模块
- 预加载关键资源
- 优化窗口创建时机

---

## 安全检查清单

- [x] contextIsolation 已启用
- [x] nodeIntegration 已禁用
- [x] sandbox 已启用
- [x] 使用 contextBridge 暴露 API
- [x] IPC 通道使用白名单
- [x] 禁止渲染进程直接访问文件系统
- [x] 禁止渲染进程执行任意代码

---

## 扩展性设计

### 1. IPC 通道扩展

预留 `src/main/ipc/` 目录，按功能模块组织：
```
ipc/
├── file-handler.ts
├── git-handler.ts
├── ai-handler.ts
└── index.ts
```

### 2. 服务层扩展

预留 `src/main/services/` 目录，按业务领域组织：
```
services/
├── FileManager.ts
├── GitAbstraction.ts
├── AIGateway.ts
└── index.ts
```

### 3. UI 组件扩展

预留 `src/renderer/components/` 目录，按功能组织：
```
components/
├── Editor/
├── FileTree/
├── AIChat/
└── common/
```

---

**创建时间：** 2026-03-03  
**最后更新：** 2026-03-03
