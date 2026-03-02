# 基础 UI 框架集成

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK003 |
| **任务标题** | 基础 UI 框架集成 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 Electron 应用中集成 React、TailwindCSS 和 Zustand，建立标准的 UI 组件库和状态管理体系，为后续界面开发提供统一的技术基础和设计规范。

### 背景

Sibylla 需要一个现代化、响应式的用户界面。本任务将建立 UI 开发的技术栈和基础组件库，确保界面开发的一致性和效率。这是所有 UI 功能开发的基础。

### 范围

**包含：**
- React 18+ 集成和配置
- TailwindCSS 样式系统配置
- Zustand 状态管理集成
- 基础布局组件（Layout、Sidebar、Header）
- 通用 UI 组件（Button、Input、Modal 等）
- 主题系统（亮色/暗色模式）
- 响应式设计基础
- 组件文档和使用示例

**不包含：**
- 具体业务组件（编辑器、文件树等，在后续任务中实现）
- 复杂交互逻辑
- 数据持久化

## 技术要求

### 技术栈

- **React:** ^18.2.0
- **TailwindCSS:** ^3.4.0
- **Zustand:** ^4.5.0
- **@headlessui/react:** ^1.7.0（无样式组件库）
- **lucide-react:** ^0.300.0（图标库）
- **clsx:** ^2.1.0（类名工具）
- **tailwind-merge:** ^2.2.0（Tailwind 类名合并）

### 架构设计

```
src/renderer/
├── App.tsx                      # 根组件
├── main.tsx                     # React 入口
├── index.html                   # HTML 模板
├── components/                  # UI 组件
│   ├── layout/                  # 布局组件
│   │   ├── AppLayout.tsx       # 应用主布局
│   │   ├── Sidebar.tsx         # 侧边栏
│   │   ├── Header.tsx          # 顶部栏
│   │   └── MainContent.tsx     # 主内容区
│   ├── ui/                      # 通用 UI 组件
│   │   ├── Button.tsx          # 按钮
│   │   ├── Input.tsx           # 输入框
│   │   ├── Modal.tsx           # 模态框
│   │   ├── Dropdown.tsx        # 下拉菜单
│   │   ├── Tooltip.tsx         # 提示框
│   │   ├── Badge.tsx           # 徽章
│   │   └── Spinner.tsx         # 加载动画
│   └── providers/               # Context Providers
│       └── ThemeProvider.tsx   # 主题提供者
├── store/                       # Zustand 状态管理
│   ├── index.ts                # Store 导出
│   ├── appStore.ts             # 应用全局状态
│   └── types.ts                # Store 类型定义
├── hooks/                       # 自定义 Hooks
│   ├── useTheme.ts             # 主题 Hook
│   └── useKeyboard.ts          # 键盘快捷键 Hook
├── styles/                      # 样式文件
│   ├── globals.css             # 全局样式
│   └── tailwind.css            # Tailwind 入口
└── utils/                       # 工具函数
    ├── cn.ts                   # 类名合并工具
    └── constants.ts            # 常量定义
```

### 实现细节

#### 1. TailwindCSS 配置（tailwind.config.js）

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sibylla 品牌色
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // 中性色
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#030712',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'SF Mono',
          'Monaco',
          'Inconsolata',
          'Fira Code',
          'Droid Sans Mono',
          'monospace',
        ],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
```

#### 2. Zustand Store 实现（src/renderer/store/appStore.ts）

```typescript
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export interface AppState {
  // 主题
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  
  // 侧边栏
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  
  // Workspace
  currentWorkspace: string | null
  setCurrentWorkspace: (workspace: string | null) => void
  
  // 当前打开的文件
  currentFile: string | null
  setCurrentFile: (file: string | null) => void
  
  // 加载状态
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  
  // 错误状态
  error: string | null
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // 初始状态
        theme: 'system',
        sidebarCollapsed: false,
        currentWorkspace: null,
        currentFile: null,
        isLoading: false,
        error: null,
        
        // Actions
        setTheme: (theme) => set({ theme }),
        
        toggleSidebar: () => set((state) => ({ 
          sidebarCollapsed: !state.sidebarCollapsed 
        })),
        
        setSidebarCollapsed: (collapsed) => set({ 
          sidebarCollapsed: collapsed 
        }),
        
        setCurrentWorkspace: (workspace) => set({ 
          currentWorkspace: workspace 
        }),
        
        setCurrentFile: (file) => set({ 
          currentFile: file 
        }),
        
        setIsLoading: (loading) => set({ 
          isLoading: loading 
        }),
        
        setError: (error) => set({ error }),
        
        clearError: () => set({ error: null }),
      }),
      {
        name: 'sibylla-app-storage',
        partialize: (state) => ({
          theme: state.theme,
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      }
    ),
    { name: 'AppStore' }
  )
)
```

#### 3. 主题系统（src/renderer/components/providers/ThemeProvider.tsx）

```typescript
import React, { createContext, useContext, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'

type ThemeContextType = {
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useAppStore()
  
  const resolvedTheme = React.useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches 
        ? 'dark' 
        : 'light'
    }
    return theme
  }, [theme])
  
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])
  
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => {
        const root = window.document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(mediaQuery.matches ? 'dark' : 'light')
      }
      
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
```

#### 4. 应用主布局（src/renderer/components/layout/AppLayout.tsx）

```typescript
import React from 'react'
import { useAppStore } from '../../store/appStore'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MainContent } from './MainContent'
import { cn } from '../../utils/cn'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useAppStore()
  
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* 侧边栏 */}
      <Sidebar />
      
      {/* 主内容区 */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden transition-all duration-300',
        sidebarCollapsed ? 'ml-16' : 'ml-64'
      )}>
        <Header />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  )
}
```

#### 5. 通用按钮组件（src/renderer/components/ui/Button.tsx）

```typescript
import React from 'react'
import { cn } from '../../utils/cn'
import { Loader2 } from 'lucide-react'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
    
    const variants = {
      primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-600',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
      outline: 'border border-gray-300 bg-transparent hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800',
      ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
    }
    
    const sizes = {
      sm: 'h-8 px-3 text-sm gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2',
    }
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!loading && icon && icon}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
```

#### 6. 类名合并工具（src/renderer/utils/cn.ts）

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并 Tailwind CSS 类名，避免冲突
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

#### 7. 全局样式（src/renderer/styles/globals.css）

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-gray-200 dark:border-gray-700;
  }
  
  html {
    @apply antialiased;
  }
  
  body {
    @apply bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100;
  }
  
  /* 自定义滚动条 */
  ::-webkit-scrollbar {
    @apply w-2 h-2;
  }
  
  ::-webkit-scrollbar-track {
    @apply bg-transparent;
  }
  
  ::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
  }
}

@layer components {
  /* 自定义组件样式 */
  .card {
    @apply rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-800;
  }
  
  .input-base {
    @apply w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:placeholder:text-gray-500;
  }
}

@layer utilities {
  /* 自定义工具类 */
  .text-balance {
    text-wrap: balance;
  }
}
```

#### 8. React 根组件（src/renderer/App.tsx）

```typescript
import React from 'react'
import { ThemeProvider } from './components/providers/ThemeProvider'
import { AppLayout } from './components/layout/AppLayout'

export default function App() {
  return (
    <ThemeProvider>
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Sibylla
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              AI 共享上下文的团队知识协作平台
            </p>
          </div>
        </div>
      </AppLayout>
    </ThemeProvider>
  )
}
```

### 数据模型

本任务主要涉及 UI 状态管理，数据模型定义在 Zustand Store 中：

```typescript
// src/renderer/store/types.ts
export type Theme = 'light' | 'dark' | 'system'

export interface AppState {
  theme: Theme
  sidebarCollapsed: boolean
  currentWorkspace: string | null
  currentFile: string | null
  isLoading: boolean
  error: string | null
}
```

### API 规范

本任务不涉及 API 调用，仅处理本地 UI 状态。

## 验收标准

### 功能完整性

- [ ] 运行 `npm run dev` 后应用显示完整的布局结构
- [ ] 侧边栏可以正常展开/收起，动画流畅
- [ ] 主题切换功能正常（亮色/暗色/跟随系统）
- [ ] 所有基础 UI 组件（Button、Input、Modal 等）正常渲染
- [ ] Zustand Store 状态更新能触发组件重新渲染
- [ ] 主题偏好能持久化到 localStorage
- [ ] 侧边栏状态能持久化到 localStorage

### 性能指标

- [ ] 组件渲染时间 < 16ms（60fps）
- [ ] 主题切换响应时间 < 100ms
- [ ] 侧边栏展开/收起动画流畅，无卡顿
- [ ] Store 状态更新不触发不必要的重渲染

### 用户体验

- [ ] 所有交互元素有 hover 和 focus 状态
- [ ] 键盘导航正常工作（Tab、Enter、Escape）
- [ ] 暗色模式下所有文字清晰可读
- [ ] 响应式布局在不同窗口尺寸下正常显示
- [ ] 加载状态有明确的视觉反馈
- [ ] 错误提示清晰友好

### 代码质量

- [ ] 所有组件有 TypeScript 类型定义
- [ ] 组件 props 有完整的类型注解
- [ ] 使用 React.forwardRef 处理 ref 传递
- [ ] 组件有 displayName 属性
- [ ] 遵循 React Hooks 规则
- [ ] ESLint 检查通过，无警告
- [ ] 代码格式符合 Prettier 规范

## 测试标准

### 单元测试

**测试工具：** Vitest + React Testing Library

**测试场景：**

1. **Button 组件测试**
   - 渲染不同 variant 的按钮
   - 测试 loading 状态
   - 测试 disabled 状态
   - 测试点击事件

2. **Zustand Store 测试**
   - 测试状态初始值
   - 测试 setTheme action
   - 测试 toggleSidebar action
   - 测试状态持久化

3. **主题系统测试**
   - 测试主题切换
   - 测试系统主题跟随
   - 测试 DOM 类名更新

### 集成测试

**测试场景：**

1. **布局集成测试**
   - 渲染完整的 AppLayout
   - 测试侧边栏展开/收起
   - 测试主题切换影响所有组件

2. **组件组合测试**
   - 测试 Modal 中的 Button
   - 测试 Form 中的 Input
   - 测试组件间状态传递

### 端到端测试

暂不要求 E2E 测试，将在 TASK013 集成测试阶段补充。

## 依赖关系

### 前置依赖

- TASK001 - Electron 应用脚手架搭建（必须完成）
- TASK002 - IPC 通信框架实现（建议完成，但不阻塞）

### 被依赖任务

- TASK008 - 文件管理器实现
- 所有后续 UI 功能开发任务

### 阻塞风险

- TailwindCSS 配置与 Vite 集成问题
- Zustand 持久化与 Electron 兼容性
- 暗色模式样式调试耗时

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| TailwindCSS JIT 模式在 Electron 中失效 | 中 | 低 | 使用标准模式或调整配置 |
| Zustand persist 与 Electron 存储冲突 | 中 | 中 | 使用 Electron Store 替代 localStorage |
| 暗色模式样式不一致 | 低 | 中 | 建立完整的设计 token 系统 |
| 组件库选择不当导致后期重构 | 高 | 低 | 使用成熟的 Headless UI 库 |

### 时间风险

- 暗色模式样式调试可能需要额外时间
- 组件库建设可能超出预期
- 响应式布局适配需要多次迭代

### 资源风险

- 需要设计师提供完整的设计规范
- 需要 UI/UX 评审确保体验一致性

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) - UI/UX 设计规范
- [`specs/requirements/phase0/infrastructure-setup.md`](../../requirements/phase0/infrastructure-setup.md) - 基础设施需求
- [React 官方文档](https://react.dev/)
- [TailwindCSS 官方文档](https://tailwindcss.com/)
- [Zustand 官方文档](https://zustand-demo.pmnd.rs/)
- [Headless UI 文档](https://headlessui.com/)

## 实施计划

### 第1步：安装依赖和配置

- 安装 React、TailwindCSS、Zustand 等依赖
- 配置 TailwindCSS（tailwind.config.js、postcss.config.js）
- 配置 Vite 支持 CSS 处理
- 预计耗时：2 小时

### 第2步：建立项目结构

- 创建 components、store、hooks、utils 目录
- 设置全局样式文件
- 配置 TypeScript 路径别名
- 预计耗时：1 小时

### 第3步：实现 Zustand Store

- 创建 appStore.ts
- 实现状态管理逻辑
- 配置 devtools 和 persist 中间件
- 编写 Store 单元测试
- 预计耗时：3 小时

### 第4步：实现主题系统

- 创建 ThemeProvider
- 实现主题切换逻辑
- 配置暗色模式样式
- 测试系统主题跟随
- 预计耗时：4 小时

### 第5步：实现基础布局组件

- 创建 AppLayout、Sidebar、Header、MainContent
- 实现侧边栏展开/收起动画
- 实现响应式布局
- 预计耗时：5 小时

### 第6步：实现通用 UI 组件

- 创建 Button、Input、Modal、Dropdown 等组件
- 实现组件变体和尺寸
- 添加 loading 和 disabled 状态
- 编写组件单元测试
- 预计耗时：6 小时

### 第7步：文档和测试

- 编写组件使用文档
- 创建组件示例页面
- 进行集成测试
- 调整样式细节
- 预计耗时：3 小时

## 完成标准

**本任务完成的标志：**

1. 所有基础 UI 组件正常工作且通过测试
2. 主题系统完整实现，亮色/暗色模式切换流畅
3. Zustand Store 状态管理正常，持久化功能正常
4. 布局组件响应式设计完善
5. 代码质量符合项目规范，TypeScript 无错误
6. 组件文档完整，新开发者能快速上手

**交付物：**

- [ ] 完整的 UI 组件库代码
- [ ] Zustand Store 实现
- [ ] 主题系统实现
- [ ] 布局组件实现
- [ ] 单元测试代码（覆盖率 ≥ 70%）
- [ ] 组件使用文档
- [ ] 组件示例页面

## 备注

### 开发建议

1. 优先实现核心布局和主题系统，再补充通用组件
2. 使用 Storybook 或类似工具展示组件库（可选）
3. 建立设计 token 系统，确保样式一致性
4. 参考成熟的组件库（如 shadcn/ui）的实现方式
5. 预留组件扩展接口，便于后续定制

### 已知问题

- TailwindCSS 在 Electron 开发模式下可能有热重载延迟
- Zustand persist 在 Electron 中需要特殊配置
- 暗色模式下某些第三方组件可能需要额外样式调整

### 后续优化

- 考虑引入动画库（如 Framer Motion）增强交互体验
- 建立完整的设计系统文档
- 实现组件的可访问性（ARIA 属性）
- 添加键盘快捷键支持

---

**创建时间：** 2026-03-02  
**最后更新：** 2026-03-02  
**更新记录：**
- 2026-03-02 - 初始创建
