# Electron 应用脚手架搭建

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK001 |
| **任务标题** | Electron 应用脚手架搭建 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

搭建 Sibylla 桌面应用的 Electron 基础架构，建立标准的项目结构、开发环境和构建流程，为后续功能开发提供稳定的技术基座。

### 背景

Electron 是 Sibylla 的核心技术选型，作为跨平台桌面应用框架，需要在项目初期建立规范的脚手架。本任务是整个 Phase 0 的起点，所有客户端功能都将基于此架构开发。

### 范围

**包含：**
- Electron 主进程和渲染进程的基础结构
- TypeScript 严格模式配置
- Vite 构建配置（渲染进程）
- electron-builder 打包配置
- 开发环境热重载
- 基础窗口管理
- 项目目录结构规范

**不包含：**
- IPC 通信实现（TASK002）
- UI 框架集成（TASK003）
- 业务逻辑代码

## 技术要求

### 技术栈

- **Electron:** ^28.0.0
- **TypeScript:** ^5.3.0（strict mode）
- **Vite:** ^5.0.0
- **electron-builder:** ^24.9.0
- **Node.js:** ≥ 18.0.0

### 架构设计

```
sibylla-desktop/
├── src/
│   ├── main/                    # 主进程
│   │   ├── index.ts            # 主进程入口
│   │   ├── window.ts           # 窗口管理
│   │   ├── ipc/                # IPC 处理器（预留）
│   │   └── services/           # 核心服务（预留）
│   ├── renderer/               # 渲染进程
│   │   ├── index.html          # HTML 入口
│   │   ├── main.tsx            # React 入口
│   │   ├── App.tsx             # 根组件
│   │   └── vite-env.d.ts       # Vite 类型定义
│   ├── preload/                # Preload 脚本
│   │   └── index.ts            # Preload 入口（预留）
│   └── shared/                 # 共享类型定义
│       └── types.ts
├── resources/                   # 应用资源
│   ├── icon.icns               # Mac 图标
│   └── icon.ico                # Windows 图标
├── electron-builder.json        # 打包配置
├── vite.config.ts              # Vite 配置
├── vite.main.config.ts         # 主进程 Vite 配置
├── vite.preload.config.ts      # Preload Vite 配置
├── tsconfig.json               # TypeScript 配置
├── tsconfig.node.json          # Node 环境 TS 配置
├── package.json
├── .eslintrc.json              # ESLint 配置
├── .prettierrc                 # Prettier 配置
└── README.md
```

### 实现细节

#### 关键实现点

1. **主进程入口（src/main/index.ts）**
   ```typescript
   import { app, BrowserWindow } from 'electron'
   import path from 'path'
   import { createMainWindow } from './window'
   
   // 禁用硬件加速（可选，根据需要）
   // app.disableHardwareAcceleration()
   
   let mainWindow: BrowserWindow | null = null
   
   app.whenReady().then(() => {
     mainWindow = createMainWindow()
     
     app.on('activate', () => {
       if (BrowserWindow.getAllWindows().length === 0) {
         mainWindow = createMainWindow()
       }
     })
   })
   
   app.on('window-all-closed', () => {
     if (process.platform !== 'darwin') {
       app.quit()
     }
   })
   ```

2. **窗口管理（src/main/window.ts）**
   ```typescript
   import { BrowserWindow } from 'electron'
   import path from 'path'
   
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
       titleBarStyle: 'hiddenInset', // Mac 样式
       trafficLightPosition: { x: 16, y: 16 }
     })
     
     if (process.env.NODE_ENV === 'development') {
       window.loadURL('http://localhost:5173')
       window.webContents.openDevTools()
     } else {
       window.loadFile(path.join(__dirname, '../renderer/index.html'))
     }
     
     return window
   }
   ```

3. **Vite 配置（vite.config.ts）**
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
       emptyOutDir: true
     },
     server: {
       port: 5173
     }
   })
   ```

4. **TypeScript 严格配置（tsconfig.json）**
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "lib": ["ES2022", "DOM", "DOM.Iterable"],
       "jsx": "react-jsx",
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true,
       "strictFunctionTypes": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "noImplicitReturns": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "moduleResolution": "bundler",
       "resolveJsonModule": true,
       "isolatedModules": true
     }
   }
   ```

5. **electron-builder 配置（electron-builder.json）**
   ```json
   {
     "appId": "io.sibylla.desktop",
     "productName": "Sibylla",
     "directories": {
       "output": "release/${version}"
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

6. **package.json 脚本**
   ```json
   {
     "scripts": {
       "dev": "concurrently \"npm run dev:vite\" \"npm run dev:electron\"",
       "dev:vite": "vite",
       "dev:electron": "wait-on http://localhost:5173 && electron .",
       "build": "npm run build:renderer && npm run build:main && npm run build:preload",
       "build:renderer": "vite build",
       "build:main": "tsc -p tsconfig.main.json",
       "build:preload": "tsc -p tsconfig.preload.json",
       "package": "npm run build && electron-builder",
       "package:mac": "npm run build && electron-builder --mac",
       "package:win": "npm run build && electron-builder --win",
       "lint": "eslint src --ext .ts,.tsx",
       "type-check": "tsc --noEmit"
     }
   }
   ```

### 数据模型

本任务不涉及数据模型。

### API 规范

本任务不涉及 API。

## 验收标准

### 功能完整性

- [ ] 运行 `npm run dev` 能在 10 秒内启动应用
- [ ] 应用窗口显示标题 "Sibylla"，尺寸 1280x800
- [ ] 开发模式下修改 React 代码能在 2 秒内热重载
- [ ] 运行 `npm run build` 能无错误完成构建
- [ ] 运行 `npm run package:mac` 能生成 DMG 文件（Mac）
- [ ] 运行 `npm run package:win` 能生成 NSIS 安装包（Windows）
- [ ] 生成的安装包能正常安装和启动

### 性能指标

- [ ] 应用冷启动时间 < 3 秒
- [ ] 开发模式热重载时间 < 2 秒
- [ ] 完整构建时间 < 2 分钟

### 用户体验

- [ ] 窗口可正常最小化、最大化、关闭
- [ ] Mac 上显示原生标题栏样式
- [ ] Windows 上显示标准窗口控件
- [ ] 应用图标正确显示

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有配置文件有注释说明
- [ ] README 包含开发环境搭建步骤

## 测试标准

### 单元测试

本任务主要是配置和脚手架搭建，暂不要求单元测试。

### 集成测试

**测试场景：**

1. **应用启动测试**
   - 启动应用
   - 验证窗口创建成功
   - 验证窗口尺寸正确
   - 验证标题正确

2. **构建测试**
   - 执行完整构建
   - 验证所有输出文件存在
   - 验证 TypeScript 编译无错误

### 端到端测试

暂不要求 E2E 测试，将在 TASK013 集成测试阶段补充。

## 依赖关系

### 前置依赖

- 无（这是 Phase 0 的第一个任务）

### 被依赖任务

- TASK002 - IPC 通信框架实现
- TASK003 - 基础 UI 框架集成
- 所有后续客户端功能开发任务

### 阻塞风险

- Electron 版本兼容性问题
- Mac 代码签名配置（可延后到发布阶段）
- Windows 安装包权限问题

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Electron 版本升级导致 API 变更 | 中 | 低 | 使用 LTS 版本，锁定版本号 |
| Vite 与 Electron 集成问题 | 中 | 中 | 参考成熟的 electron-vite 模板 |
| 跨平台构建环境差异 | 低 | 中 | 使用 Docker 或 GitHub Actions 统一构建环境 |
| TypeScript 严格模式配置过严 | 低 | 低 | 根据实际情况适当调整配置 |

### 时间风险

- 首次配置 Electron + Vite 可能需要调试时间
- Mac 和 Windows 打包测试需要双平台环境

### 资源风险

- 需要 Mac 和 Windows 开发机进行测试
- 需要 Apple Developer 账号（代码签名，可延后）

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/requirements/phase0/infrastructure-setup.md`](../../requirements/phase0/infrastructure-setup.md) - 基础设施需求
- [Electron 官方文档](https://www.electronjs.org/docs/latest/)
- [Vite 官方文档](https://vitejs.dev/)
- [electron-builder 文档](https://www.electron.build/)

## 实施计划

### 第1步：项目初始化

- 创建项目目录结构
- 初始化 package.json
- 安装核心依赖
- 预计耗时：2 小时

### 第2步：配置 TypeScript 和构建工具

- 配置 tsconfig.json（strict mode）
- 配置 Vite（主进程、渲染进程、preload）
- 配置 ESLint 和 Prettier
- 预计耗时：3 小时

### 第3步：实现主进程和窗口管理

- 编写主进程入口代码
- 实现窗口创建和管理
- 配置安全选项（contextIsolation 等）
- 预计耗时：4 小时

### 第4步：配置渲染进程

- 创建基础 HTML 模板
- 配置 React 入口
- 实现简单的欢迎页面
- 预计耗时：2 小时

### 第5步：配置打包和发布

- 配置 electron-builder
- 准备应用图标
- 测试 Mac DMG 生成
- 测试 Windows NSIS 生成
- 预计耗时：4 小时

### 第6步：文档和测试

- 编写 README
- 编写开发环境搭建文档
- 进行跨平台测试
- 预计耗时：3 小时

## 完成标准

**本任务完成的标志：**

1. 能够在 Mac 和 Windows 上运行 `npm run dev` 启动开发环境
2. 能够在 Mac 和 Windows 上运行 `npm run package` 生成安装包
3. 生成的安装包能够正常安装和运行
4. 所有配置文件符合项目规范
5. README 文档完整，新开发者能够按照文档完成环境搭建

**交付物：**

- [ ] 完整的项目脚手架代码
- [ ] Mac DMG 安装包（测试版）
- [ ] Windows NSIS 安装包（测试版）
- [ ] 开发环境搭建文档（README.md）
- [ ] 配置文件说明文档

## 备注

### 开发建议

1. 优先使用成熟的 electron-vite 模板作为起点
2. 严格遵循 Electron 安全最佳实践
3. 预留 IPC 通信的目录结构，但不实现具体功能
4. 图标可以先使用占位图标，后续由设计师提供

### 已知问题

- Mac 代码签名需要 Apple Developer 账号，Phase 0 可以使用未签名版本
- Windows 安装包可能触发 SmartScreen 警告，需要代码签名证书解决

---

**创建时间：** 2026-03-01  
**最后更新：** 2026-03-01  
**更新记录：**
- 2026-03-01 - 初始创建
