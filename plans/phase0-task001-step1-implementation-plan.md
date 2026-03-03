# Phase 0 Task 001 - Step 1: 初始化项目结构

## 执行计划

**任务ID:** PHASE0-TASK001  
**步骤:** 第1步 - 初始化项目结构  
**创建时间:** 2026-03-03  
**预计耗时:** 2小时

---

## 一、需求分析总结

### 1.1 核心目标

搭建 Sibylla 桌面应用的 Electron 基础架构，建立标准的项目结构、开发环境和构建流程。

### 1.2 技术栈确认

- **Electron:** ^28.0.0
- **TypeScript:** ^5.3.0（strict mode）
- **Vite:** ^5.0.0
- **electron-builder:** ^24.9.0
- **Node.js:** ≥ 18.0.0
- **React:** ^18.2.0
- **TailwindCSS:** ^3.4.0

### 1.3 架构约束

根据 [`CLAUDE.md`](../CLAUDE.md) 和 [`architecture.md`](../specs/design/architecture.md)：

- 主进程与渲染进程严格隔离
- 启用 contextIsolation，禁用 nodeIntegration
- 使用 contextBridge 暴露安全的 API
- TypeScript 严格模式，禁止 any
- 所有配置文件需要详细注释

---

## 二、项目目录结构设计

```
sibylla-desktop/
├── src/
│   ├── main/                    # 主进程代码
│   │   ├── index.ts            # 主进程入口
│   │   ├── window.ts           # 窗口管理
│   │   ├── ipc/                # IPC 处理器（预留）
│   │   │   └── .gitkeep
│   │   └── services/           # 核心服务（预留）
│   │       └── .gitkeep
│   ├── renderer/               # 渲染进程代码
│   │   ├── index.html          # HTML 入口
│   │   ├── main.tsx            # React 入口
│   │   ├── App.tsx             # 根组件
│   │   ├── vite-env.d.ts       # Vite 类型定义
│   │   ├── components/         # UI 组件（预留）
│   │   │   └── .gitkeep
│   │   ├── hooks/              # React Hooks（预留）
│   │   │   └── .gitkeep
│   │   └── styles/             # 样式文件
│   │       └── index.css       # 全局样式
│   ├── preload/                # Preload 脚本
│   │   └── index.ts            # Preload 入口
│   └── shared/                 # 共享类型定义
│       └── types.ts            # 类型定义
├── resources/                   # 应用资源
│   ├── icon.icns               # Mac 图标（占位）
│   └── icon.ico                # Windows 图标（占位）
├── build/                       # 构建配置
│   └── entitlements.mac.plist  # Mac 权限配置
├── dist/                        # 构建输出（.gitignore）
├── release/                     # 打包输出（.gitignore）
├── node_modules/                # 依赖（.gitignore）
├── electron-builder.json        # 打包配置
├── vite.config.ts              # Vite 配置（渲染进程）
├── vite.main.config.ts         # 主进程 Vite 配置
├── vite.preload.config.ts      # Preload Vite 配置
├── tsconfig.json               # TypeScript 配置
├── tsconfig.main.json          # 主进程 TS 配置
├── tsconfig.renderer.json      # 渲染进程 TS 配置
├── .eslintrc.json              # ESLint 配置
├── .prettierrc                 # Prettier 配置
├── .gitignore                  # Git 忽略配置
├── package.json                # 项目配置
└── README.md                   # 项目说明
```

---

## 三、详细实施步骤

### 步骤 1: 创建项目根目录和基础结构

**操作：**
```bash
mkdir -p sibylla-desktop
cd sibylla-desktop
mkdir -p src/{main/{ipc,services},renderer/{components,hooks,styles},preload,shared}
mkdir -p resources build
```

**创建占位文件：**
```bash
touch src/main/ipc/.gitkeep
touch src/main/services/.gitkeep
touch src/renderer/components/.gitkeep
touch src/renderer/hooks/.gitkeep
```

---

### 步骤 2: 初始化 package.json

**核心依赖：**

**生产依赖：**
- `electron`: ^28.0.0
- `react`: ^18.2.0
- `react-dom`: ^18.2.0

**开发依赖：**
- `@types/node`: ^20.0.0
- `@types/react`: ^18.2.0
- `@types/react-dom`: ^18.2.0
- `@vitejs/plugin-react`: ^4.2.0
- `electron-builder`: ^24.9.0
- `typescript`: ^5.3.0
- `vite`: ^5.0.0
- `eslint`: ^8.56.0
- `@typescript-eslint/eslint-plugin`: ^6.19.0
- `@typescript-eslint/parser`: ^6.19.0
- `prettier`: ^3.2.0
- `concurrently`: ^8.2.0
- `wait-on`: ^7.2.0

**脚本配置：**
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:vite\" \"npm run dev:electron\"",
    "dev:vite": "vite",
    "dev:electron": "wait-on http://localhost:5173 && electron .",
    "build": "npm run build:renderer && npm run build:main && npm run build:preload",
    "build:renderer": "vite build",
    "build:main": "vite build --config vite.main.config.ts",
    "build:preload": "vite build --config vite.preload.config.ts",
    "package": "npm run build && electron-builder",
    "package:mac": "npm run build && electron-builder --mac",
    "package:win": "npm run build && electron-builder --win",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css}\"",
    "type-check": "tsc --noEmit"
  }
}
```

---

### 步骤 3: 配置 TypeScript 严格模式

**tsconfig.json（基础配置）：**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    
    // 严格模式配置
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    
    // 额外的严格检查
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**tsconfig.main.json（主进程）：**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "dist/main",
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/shared/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**tsconfig.renderer.json（渲染进程）：**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist/renderer",
    "types": ["vite/client"]
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### 步骤 4: 配置 Vite 构建系统

**vite.config.ts（渲染进程）：**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.join(__dirname, 'src/renderer/index.html')
      }
    },
    target: 'chrome120'
  },
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
      '@shared': path.join(__dirname, 'src/shared')
    }
  }
})
```

**vite.main.config.ts（主进程）：**
```typescript
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist/main'),
    emptyOutDir: true,
    lib: {
      entry: path.join(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'os']
    },
    target: 'node18',
    minify: process.env.NODE_ENV === 'production'
  },
  resolve: {
    alias: {
      '@main': path.join(__dirname, 'src/main'),
      '@shared': path.join(__dirname, 'src/shared')
    }
  }
})
```

**vite.preload.config.ts（Preload）：**
```typescript
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist/preload'),
    emptyOutDir: true,
    lib: {
      entry: path.join(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['electron']
    },
    target: 'node18'
  }
})
```

---

### 步骤 5: 创建 Electron 主进程入口文件

**src/main/index.ts：**
```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { createMainWindow } from './window'

let mainWindow: BrowserWindow | null = null

// 应用准备就绪
app.whenReady().then(() => {
  mainWindow = createMainWindow()
  
  // macOS 特性：点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

**src/main/window.ts：**
```typescript
import { BrowserWindow } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Sibylla',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    // macOS 样式
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 }
  })
  
  if (isDev) {
    // 开发环境：加载 Vite 开发服务器
    window.loadURL('http://localhost:5173')
    window.webContents.openDevTools()
  } else {
    // 生产环境：加载构建产物
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  
  return window
}
```

---

### 步骤 6: 创建 Electron 渲染进程入口文件

**src/renderer/index.html：**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sibylla</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

**src/renderer/main.tsx：**
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**src/renderer/App.tsx：**
```typescript
import React from 'react'

export default function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Sibylla
        </h1>
        <p className="text-gray-600">
          Phase 0 - Electron 脚手架搭建完成
        </p>
      </div>
    </div>
  )
}
```

**src/renderer/styles/index.css：**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**src/renderer/vite-env.d.ts：**
```typescript
/// <reference types="vite/client" />
```

---

### 步骤 7: 配置 Preload 脚本

**src/preload/index.ts：**
```typescript
import { contextBridge, ipcRenderer } from 'electron'

// 定义暴露给渲染进程的 API 接口
interface ElectronAPI {
  // 测试用的 ping 方法
  ping: () => Promise<string>
}

// 通过 contextBridge 暴露安全的 API
const api: ElectronAPI = {
  ping: () => ipcRenderer.invoke('test:ping')
}

contextBridge.exposeInMainWorld('electronAPI', api)

// 类型声明
export type { ElectronAPI }
```

**src/shared/types.ts：**
```typescript
// 全局类型声明
declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>
    }
  }
}

export {}
```

---

### 步骤 8: 配置 electron-builder 打包

**electron-builder.json：**
```json
{
  "appId": "io.sibylla.desktop",
  "productName": "Sibylla",
  "directories": {
    "output": "release/${version}",
    "buildResources": "resources"
  },
  "files": [
    "dist/**/*",
    "package.json"
  ],
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.productivity",
    "icon": "resources/icon.icns",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist"
  },
  "win": {
    "target": ["nsis", "portable"],
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

**build/entitlements.mac.plist：**
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

---

### 步骤 9: 配置代码规范工具

**.eslintrc.json：**
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "plugins": ["@typescript-eslint", "react"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "react/react-in-jsx-scope": "off"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

**.prettierrc：**
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always"
}
```

**.gitignore：**
```
# 依赖
node_modules/

# 构建输出
dist/
release/

# 日志
*.log
npm-debug.log*

# 系统文件
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# 环境变量
.env
.env.local
```

---

### 步骤 10: 创建 README.md

**README.md：**
```markdown
# Sibylla Desktop

Sibylla 桌面应用 - Phase 0 基础设施搭建

## 技术栈

- Electron 28
- React 18
- TypeScript 5.3（严格模式）
- Vite 5
- TailwindCSS 3

## 开发环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

## 快速开始

### 安装依赖

\`\`\`bash
npm install
\`\`\`

### 开发模式

\`\`\`bash
npm run dev
\`\`\`

应用将在开发模式下启动，支持热重载。

### 构建

\`\`\`bash
npm run build
\`\`\`

### 打包

\`\`\`bash
# Mac
npm run package:mac

# Windows
npm run package:win
\`\`\`

## 项目结构

\`\`\`
sibylla-desktop/
├── src/
│   ├── main/          # 主进程
│   ├── renderer/      # 渲染进程
│   ├── preload/       # Preload 脚本
│   └── shared/        # 共享类型
├── resources/         # 应用资源
├── build/             # 构建配置
└── dist/              # 构建输出
\`\`\`

## 开发规范

- 遵循 TypeScript 严格模式
- 禁止使用 `any` 类型
- 使用 ESLint 和 Prettier 保持代码风格一致
- 提交前运行 `npm run lint` 和 `npm run type-check`

## 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目宪法
- [架构设计](../specs/design/architecture.md)
- [Phase 0 需求](../specs/requirements/phase0/infrastructure-setup.md)
```

---

## 四、验收标准

### 4.1 功能完整性

- [ ] 运行 `npm run dev` 能在 10 秒内启动应用
- [ ] 应用窗口显示标题 "Sibylla"，尺寸 1280x800
- [ ] 窗口中显示欢迎页面
- [ ] 开发模式下修改 React 代码能在 2 秒内热重载
- [ ] 运行 `npm run build` 能无错误完成构建
- [ ] 构建产物位于 `dist/` 目录

### 4.2 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有配置文件有注释说明
- [ ] README 包含开发环境搭建步骤

### 4.3 安全配置

- [ ] contextIsolation 已启用
- [ ] nodeIntegration 已禁用
- [ ] sandbox 已启用
- [ ] preload 脚本正确配置

---

## 五、风险与注意事项

### 5.1 已知风险

1. **Vite 与 Electron 集成问题**
   - 缓解措施：参考成熟的 electron-vite 模板
   - 备选方案：使用 electron-vite 包装器

2. **TypeScript 严格模式配置过严**
   - 缓解措施：根据实际情况适当调整配置
   - 备选方案：逐步启用严格选项

3. **跨平台路径问题**
   - 缓解措施：统一使用 `path.join()` 处理路径
   - 备选方案：使用 `path.resolve()` 确保绝对路径

### 5.2 注意事项

1. 确保 Node.js 版本 >= 18.0.0
2. 开发环境端口 5173 不被占用
3. 主进程代码修改需要重启 Electron
4. 渲染进程代码修改支持热重载
5. 图标文件暂时使用占位图标，后续由设计师提供

---

## 六、后续步骤

完成本步骤后，继续执行：

1. **第2步：配置 TypeScript 和构建工具**（已包含在本步骤）
2. **第3步：实现主进程和窗口管理**（已包含在本步骤）
3. **第4步：配置渲染进程**（已包含在本步骤）
4. **第5步：配置打包和发布**（已包含在本步骤）
5. **第6步：文档和测试**

---

## 七、参考资料

- [Electron 官方文档](https://www.electronjs.org/docs/latest/)
- [Vite 官方文档](https://vitejs.dev/)
- [electron-builder 文档](https://www.electron.build/)
- [TypeScript 严格模式](https://www.typescriptlang.org/tsconfig#strict)
- [React 18 文档](https://react.dev/)

---

**创建时间：** 2026-03-03  
**最后更新：** 2026-03-03  
**状态：** 待执行
