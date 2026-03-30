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

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在开发模式下启动，支持热重载。

### 构建

```bash
npm run build
```

### 打包

```bash
# Mac
npm run package:mac

# Windows
npm run package:win
```

## 项目结构

```
sibylla-desktop/
├── src/
│   ├── main/          # 主进程
│   ├── renderer/      # 渲染进程
│   ├── preload/       # Preload 脚本
│   └── shared/        # 共享类型
├── resources/         # 应用资源
├── build/             # 构建配置
└── dist/              # 构建输出
```

## 开发规范

- 遵循 TypeScript 严格模式
- 禁止使用 `any` 类型
- 使用 ESLint 和 Prettier 保持代码风格一致
- 提交前运行 `npm run lint` 和 `npm run type-check`

## 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目宪法
- [架构设计](../specs/design/architecture.md)
- [Phase 0 需求](../specs/requirements/phase0/infrastructure-setup.md)
