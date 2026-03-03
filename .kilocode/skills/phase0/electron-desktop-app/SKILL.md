---
name: electron-desktop-app
description: >-
  Electron 桌面应用开发最佳实践。当需要开发 Electron 桌面应用、配置主进程与渲染进程架构、实现进程隔离与安全配置、集成原生模块、配置自动更新机制、或处理跨平台兼容性问题时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - electron
    - desktop-app
    - cross-platform
    - typescript
---

# Electron 桌面应用开发

此 skill 提供 Electron 桌面应用开发的最佳实践指南，涵盖架构设计、安全配置、原生模块集成、自动更新、打包分发等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 搭建新的 Electron 应用项目架构
- 配置主进程与渲染进程的通信机制
- 实现进程隔离与安全配置（contextIsolation、nodeIntegration）
- 集成原生 Node.js 模块（如 better-sqlite3）
- 配置自动更新机制（electron-updater）
- 使用 electron-builder 打包和分发应用
- 处理 macOS 和 Windows 的跨平台兼容性问题

## 核心概念

### 1. Electron 架构模型

Electron 应用采用多进程架构：

```
┌─────────────────────────────────────────┐
│           主进程 (Main Process)          │
│  - Node.js 完整访问权限                   │
│  - 管理应用生命周期                       │
│  - 创建和管理窗口                         │
│  - 处理系统级操作（文件、数据库、网络）     │
│  - 原生模块集成                           │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌──────▼─────────┐
│  渲染进程 1     │  │  渲染进程 2     │
│  - Chromium     │  │  - Chromium     │
│  - React/Vue    │  │  - React/Vue    │
│  - 受限环境     │  │  - 受限环境     │
│  - UI 渲染      │  │  - UI 渲染      │
└────────────────┘  └────────────────┘
```

**关键原则**：
- 主进程拥有完整的 Node.js 权限，负责系统级操作
- 渲染进程运行在受限的浏览器环境中，负责 UI 渲染
- 进程间通过 IPC（Inter-Process Communication）通信
- 严格隔离渲染进程，避免直接访问 Node.js API

### 2. 安全配置最佳实践

在 [`BrowserWindow`](https://www.electronjs.org/docs/latest/api/browser-window) 配置中必须启用以下安全选项：

```typescript
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    // 必须启用：隔离渲染进程上下文
    contextIsolation: true,
    
    // 必须禁用：防止渲染进程直接访问 Node.js
    nodeIntegration: false,
    
    // 必须禁用：防止渲染进程访问远程模块
    enableRemoteModule: false,
    
    // 必须配置：通过 preload 脚本暴露安全的 API
    preload: path.join(__dirname, 'preload.js'),
    
    // 推荐启用：沙箱模式（进一步隔离）
    sandbox: true,
  },
});
```

**安全原则**：
- `contextIsolation: true` - 隔离渲染进程的 JavaScript 上下文，防止恶意代码访问 Electron 内部 API
- `nodeIntegration: false` - 禁止渲染进程直接使用 Node.js API
- `enableRemoteModule: false` - 禁用已废弃的 remote 模块
- 使用 [`contextBridge`](https://www.electronjs.org/docs/latest/api/context-bridge) 在 preload 脚本中暴露受控的 API

### 3. Preload 脚本与 contextBridge

Preload 脚本是连接主进程和渲染进程的桥梁，通过 [`contextBridge`](https://www.electronjs.org/docs/latest/api/context-bridge) 暴露类型安全的 API：

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// 定义暴露给渲染进程的 API 接口
interface ElectronAPI {
  // 文件操作
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  
  // AI 操作（支持流式响应）
  chatWithAI: (request: ChatRequest) => AsyncIterable<ChatChunk>;
  
  // Git 操作
  getGitStatus: () => Promise<GitStatus>;
  syncGit: () => Promise<SyncResult>;
}

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => 
    ipcRenderer.invoke('file:write', path, content),
  
  // 流式响应示例
  chatWithAI: async function* (request: ChatRequest) {
    const channel = `ai:chat:${Date.now()}`;
    ipcRenderer.send('ai:chat', channel, request);
    
    while (true) {
      const chunk = await new Promise<ChatChunk>((resolve) => {
        ipcRenderer.once(channel, (_, data) => resolve(data));
      });
      
      if (chunk.done) break;
      yield chunk;
    }
  },
  
  getGitStatus: () => ipcRenderer.invoke('git:status'),
  syncGit: () => ipcRenderer.invoke('git:sync'),
} as ElectronAPI);

// 在渲染进程中使用
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

**最佳实践**：
- 使用 TypeScript 定义清晰的 API 接口
- 优先使用 [`ipcRenderer.invoke`](https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendererinvokechannel-args) 进行双向通信（返回 Promise）
- 对于流式数据（如 AI streaming），使用自定义通道 + [`ipcRenderer.on`](https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendereronchannel-listener)
- 在 preload 脚本中进行参数验证和错误处理
- 避免暴露过于底层的 API，保持最小权限原则

### 4. 主进程 IPC 处理

在主进程中注册 IPC 处理器：

```typescript
// main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { FileManager } from './services/FileManager';
import { GitAbstraction } from './services/GitAbstraction';
import { AIGateway } from './services/AIGateway';

// 文件操作
ipcMain.handle('file:read', async (event, path: string) => {
  try {
    return await FileManager.read(path);
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
});

ipcMain.handle('file:write', async (event, path: string, content: string) => {
  try {
    await FileManager.write(path, content);
    await GitAbstraction.autoCommit(path, 'Update file');
  } catch (error) {
    console.error('Failed to write file:', error);
    throw error;
  }
});

// AI 流式响应
ipcMain.on('ai:chat', async (event, channel: string, request: ChatRequest) => {
  try {
    const stream = await AIGateway.chat(request);
    
    for await (const chunk of stream) {
      event.sender.send(channel, chunk);
    }
    
    event.sender.send(channel, { done: true });
  } catch (error) {
    console.error('AI chat error:', error);
    event.sender.send(channel, { error: error.message, done: true });
  }
});

// Git 操作
ipcMain.handle('git:status', async () => {
  return await GitAbstraction.getStatus();
});

ipcMain.handle('git:sync', async () => {
  return await GitAbstraction.sync();
});
```

**最佳实践**：
- 使用 [`ipcMain.handle`](https://www.electronjs.org/docs/latest/api/ipc-main#ipcmainhandlechannel-listener) 处理需要返回值的请求
- 使用 [`ipcMain.on`](https://www.electronjs.org/docs/latest/api/ipc-main#ipcmainonchannel-listener) 处理单向消息或流式数据
- 在处理器中进行完整的错误处理
- 将业务逻辑封装在独立的服务类中（如 FileManager、GitAbstraction）
- 避免在 IPC 处理器中直接编写复杂逻辑

### 5. 原生模块集成

集成原生 Node.js 模块（如 [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)）：

```typescript
// main.ts
import Database from 'better-sqlite3';

class DatabaseManager {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    // 在主进程中初始化数据库
    this.db = new Database(dbPath, {
      verbose: console.log,
    });
    
    // 启用 WAL 模式提升并发性能
    this.db.pragma('journal_mode = WAL');
    
    // 初始化 schema
    this.initSchema();
  }
  
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        content TEXT,
        updated_at INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at);
    `);
  }
  
  // 提供类型安全的查询方法
  getFile(path: string): FileRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM files WHERE path = ?');
    return stmt.get(path) as FileRecord | undefined;
  }
  
  saveFile(path: string, content: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (path, content, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at
    `);
    
    stmt.run(path, content, Date.now());
  }
}

// 在 IPC 中暴露数据库操作
ipcMain.handle('db:getFile', async (event, path: string) => {
  return dbManager.getFile(path);
});

ipcMain.handle('db:saveFile', async (event, path: string, content: string) => {
  dbManager.saveFile(path, content);
});
```

**最佳实践**：
- 原生模块只能在主进程中使用，不能在渲染进程中直接调用
- 使用 TypeScript 定义数据库 schema 的类型
- 启用 WAL 模式提升 SQLite 并发性能
- 使用 prepared statements 防止 SQL 注入
- 封装数据库操作为独立的服务类

### 6. 自动更新机制

使用 [`electron-updater`](https://www.electron.build/auto-update) 实现自动更新：

```typescript
// main.ts
import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';

class UpdateManager {
  private mainWindow: BrowserWindow;
  
  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupAutoUpdater();
  }
  
  private setupAutoUpdater() {
    // 配置更新服务器
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'your-org',
      repo: 'your-repo',
    });
    
    // 监听更新事件
    autoUpdater.on('checking-for-update', () => {
      this.sendStatusToWindow('正在检查更新...');
    });
    
    autoUpdater.on('update-available', (info) => {
      this.sendStatusToWindow('发现新版本，开始下载...');
    });
    
    autoUpdater.on('update-not-available', (info) => {
      this.sendStatusToWindow('当前已是最新版本');
    });
    
    autoUpdater.on('download-progress', (progressObj) => {
      const message = `下载进度: ${progressObj.percent.toFixed(2)}%`;
      this.sendStatusToWindow(message);
    });
    
    autoUpdater.on('update-downloaded', (info) => {
      this.sendStatusToWindow('更新下载完成，将在重启后安装');
      
      // 提示用户重启应用
      dialog.showMessageBox(this.mainWindow, {
        type: 'info',
        title: '更新已就绪',
        message: '新版本已下载完成，是否立即重启应用？',
        buttons: ['立即重启', '稍后'],
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });
    
    autoUpdater.on('error', (error) => {
      console.error('更新错误:', error);
      this.sendStatusToWindow('更新失败: ' + error.message);
    });
  }
  
  private sendStatusToWindow(message: string) {
    this.mainWindow.webContents.send('update:status', message);
  }
  
  checkForUpdates() {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// 在应用启动后检查更新
app.whenReady().then(() => {
  const mainWindow = createWindow();
  const updateManager = new UpdateManager(mainWindow);
  
  // 启动后 5 秒检查更新
  setTimeout(() => {
    updateManager.checkForUpdates();
  }, 5000);
});
```

**最佳实践**：
- 在应用启动后延迟检查更新，避免影响启动性能
- 提供清晰的更新进度反馈给用户
- 使用 [`dialog`](https://www.electronjs.org/docs/latest/api/dialog) 提示用户重启应用
- 在生产环境中配置代码签名，确保更新包的安全性
- 支持增量更新以减少下载大小

### 7. 打包与分发

使用 [`electron-builder`](https://www.electron.build/) 配置打包：

```json
// package.json
{
  "name": "sibylla",
  "version": "1.0.0",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win",
    "package:all": "electron-builder --mac --win"
  },
  "build": {
    "appId": "com.sibylla.app",
    "productName": "Sibylla",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "target": ["dmg", "zip"],
      "icon": "build/icon.icns",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "publish": {
      "provider": "github",
      "owner": "your-org",
      "repo": "your-repo"
    }
  }
}
```

**macOS 代码签名配置**（[`entitlements.mac.plist`](https://www.electron.build/configuration/mac)）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
</dict>
</plist>
```

**最佳实践**：
- 为 macOS 和 Windows 分别配置打包目标
- 配置代码签名以通过系统安全检查
- 使用 NSIS 为 Windows 创建安装程序
- 配置 `publish` 字段以支持自动更新
- 优化 `files` 配置，只打包必要的文件

### 8. 跨平台兼容性

处理 macOS 和 Windows 的差异：

```typescript
// utils/platform.ts
import { platform } from 'os';
import path from 'path';

export const isMac = platform() === 'darwin';
export const isWindows = platform() === 'win32';
export const isLinux = platform() === 'linux';

// 获取用户数据目录
export function getUserDataPath(): string {
  if (isMac) {
    return path.join(process.env.HOME!, 'Library', 'Application Support', 'Sibylla');
  } else if (isWindows) {
    return path.join(process.env.APPDATA!, 'Sibylla');
  } else {
    return path.join(process.env.HOME!, '.sibylla');
  }
}

// 获取日志目录
export function getLogPath(): string {
  if (isMac) {
    return path.join(process.env.HOME!, 'Library', 'Logs', 'Sibylla');
  } else if (isWindows) {
    return path.join(process.env.APPDATA!, 'Sibylla', 'logs');
  } else {
    return path.join(process.env.HOME!, '.sibylla', 'logs');
  }
}

// 菜单快捷键
export function getAccelerator(key: string): string {
  const modifier = isMac ? 'Cmd' : 'Ctrl';
  return `${modifier}+${key}`;
}
```

**最佳实践**：
- 使用 [`app.getPath`](https://www.electronjs.org/docs/latest/api/app#appgetpathname) 获取标准路径
- 为不同平台配置不同的快捷键（macOS 使用 Cmd，Windows 使用 Ctrl）
- 测试文件路径分隔符的兼容性（使用 [`path.join`](https://nodejs.org/api/path.html#pathjoinpaths) 而非硬编码 `/` 或 `\`）
- 注意 macOS 的菜单栏行为（应用菜单在顶部）与 Windows 的差异

## 开发工作流

### 1. 项目结构

```
sibylla/
├── src/
│   ├── main/              # 主进程代码
│   │   ├── main.ts        # 主进程入口
│   │   ├── preload.ts     # Preload 脚本
│   │   └── services/      # 业务逻辑服务
│   │       ├── FileManager.ts
│   │       ├── GitAbstraction.ts
│   │       ├── AIGateway.ts
│   │       └── DatabaseManager.ts
│   └── renderer/          # 渲染进程代码
│       ├── App.tsx        # React 应用入口
│       ├── components/    # React 组件
│       └── stores/        # Zustand 状态管理
├── build/                 # 打包资源
│   ├── icon.icns          # macOS 图标
│   ├── icon.ico           # Windows 图标
│   └── entitlements.mac.plist
├── dist/                  # 构建输出
├── release/               # 打包输出
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 2. 开发环境配置

使用 Vite 配置开发环境热重载：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist/main',
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist/preload',
          },
        },
      },
    ]),
  ],
  server: {
    port: 3000,
  },
});
```

### 3. TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "release"]
}
```

## 常见问题

### 1. 渲染进程无法访问 Node.js API

**问题**：在渲染进程中使用 `require('fs')` 报错。

**解决方案**：
- 确保 `nodeIntegration: false` 和 `contextIsolation: true`
- 在主进程中实现文件操作，通过 IPC 暴露给渲染进程
- 在 preload 脚本中使用 `contextBridge` 暴露安全的 API

### 2. 原生模块加载失败

**问题**：`better-sqlite3` 等原生模块在打包后无法加载。

**解决方案**：
- 使用 [`electron-rebuild`](https://github.com/electron/rebuild) 重新编译原生模块
- 在 `package.json` 中配置 `build.asarUnpack` 排除原生模块
- 确保原生模块只在主进程中使用

### 3. 自动更新签名验证失败

**问题**：macOS 上自动更新失败，提示签名无效。

**解决方案**：
- 配置 Apple Developer 证书进行代码签名
- 在 `build.mac` 中配置 `hardenedRuntime: true`
- 配置 `entitlements.mac.plist` 文件
- 使用 `electron-builder` 的 `--publish` 选项发布更新

## 参考资源

- [Electron 官方文档](https://www.electronjs.org/docs/latest/)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder 文档](https://www.electron.build/)
- [electron-updater 文档](https://www.electron.build/auto-update)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3/wiki)
- [Vite Electron Plugin](https://github.com/electron-vite/vite-plugin-electron)

## 总结

遵循以下核心原则开发 Electron 应用：

1. **安全第一**：启用 `contextIsolation`，禁用 `nodeIntegration`
2. **进程隔离**：主进程处理系统操作，渲染进程专注 UI
3. **类型安全**：使用 TypeScript 严格模式，定义清晰的 IPC 接口
4. **最小权限**：通过 `contextBridge` 只暴露必要的 API
5. **跨平台兼容**：处理 macOS 和 Windows 的差异
6. **自动更新**：配置 `electron-updater` 和代码签名
7. **性能优化**：使用 Vite 提升开发体验，优化打包体积
