# UI 组件文档

> Sibylla Desktop UI 组件库使用指南

---

## 概述

Sibylla Desktop 采用 Notion 风格的黑白灰配色方案，结合玻璃拟态设计，提供了一套完整的 UI 组件库。所有组件基于 React + TypeScript + TailwindCSS 构建，支持亮色/暗色主题切换。

### 设计原则

- **简洁优雅**：Notion 风格的极简设计
- **类型安全**：完整的 TypeScript 类型定义
- **主题支持**：亮色/暗色/系统主题自动切换
- **响应式**：适配不同屏幕尺寸
- **可访问性**：支持键盘导航和屏幕阅读器

---

## 布局组件

### AppLayout

应用主布局组件，包含侧边栏、头部和主内容区。

**Props:**
```typescript
interface AppLayoutProps {
  children: React.ReactNode
}
```

**使用示例:**
```tsx
import { AppLayout } from './components/layout/AppLayout'

function App() {
  return (
    <AppLayout>
      <YourContent />
    </AppLayout>
  )
}
```

### Sidebar

侧边栏组件，支持展开/折叠，使用玻璃拟态效果。

**特性:**
- 可折叠设计（宽度：64px ↔ 256px）
- 玻璃拟态背景效果
- 支持键盘导航
- Active 状态高亮

**使用示例:**
```tsx
import { Sidebar } from './components/layout/Sidebar'

// Sidebar 已集成在 AppLayout 中，通常不需要单独使用
```

### Header

顶部导航栏组件，包含主题切换按钮。

**特性:**
- 玻璃拟态背景
- 主题切换按钮（light/dark/system）
- 响应式设计

### MainContent

主内容区域容器组件。

**Props:**
```typescript
interface MainContentProps {
  children: React.ReactNode
}
```

### FileTree

文件树组件，支持递归渲染、展开折叠、文件选择。

**Props:**
```typescript
interface FileTreeProps {
  data: FileNode[]
  onFileSelect?: (node: FileNode) => void
}

interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileNode[]
}
```

**使用示例:**
```tsx
import { FileTree } from './components/layout/FileTree'

const fileData = [
  {
    id: '1',
    name: 'src',
    type: 'folder',
    children: [
      { id: '2', name: 'App.tsx', type: 'file' },
      { id: '3', name: 'index.tsx', type: 'file' }
    ]
  }
]

<FileTree 
  data={fileData} 
  onFileSelect={(node) => console.log('Selected:', node.name)}
/>
```

**性能优化:**
- 使用 `React.memo` 避免不必要的重渲染
- 使用 `Set` 存储展开状态，实现 O(1) 查找
- 支持键盘导航（Enter/Space 展开折叠）

---

## 基础 UI 组件

### Button

按钮组件，支持多种变体和尺寸。

**Props:**
```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}
```

**使用示例:**
```tsx
import { Button } from './components/ui/Button'
import { Plus } from 'lucide-react'

// 基础用法
<Button>点击我</Button>

// 不同变体
<Button variant="primary">主要按钮</Button>
<Button variant="secondary">次要按钮</Button>
<Button variant="outline">轮廓按钮</Button>
<Button variant="ghost">幽灵按钮</Button>
<Button variant="danger">危险按钮</Button>

// 不同尺寸
<Button size="sm">小按钮</Button>
<Button size="md">中按钮</Button>
<Button size="lg">大按钮</Button>

// 带图标
<Button icon={<Plus size={16} />}>添加</Button>

// 加载状态
<Button loading>加载中...</Button>
```

### Input

输入框组件，支持标签、错误提示。

**Props:**
```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}
```

**使用示例:**
```tsx
import { Input } from './components/ui/Input'

// 基础用法
<Input placeholder="请输入内容" />

// 带标签
<Input label="用户名" placeholder="请输入用户名" />

// 错误状态
<Input 
  label="邮箱" 
  error="邮箱格式不正确" 
  placeholder="请输入邮箱"
/>

// 禁用状态
<Input label="只读字段" value="不可编辑" disabled />
```

### Textarea

多行文本输入组件。

**Props:**
```typescript
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}
```

**使用示例:**
```tsx
import { Textarea } from './components/ui/Textarea'

<Textarea 
  label="描述" 
  placeholder="请输入描述信息"
  helperText="最多500字"
  rows={4}
/>
```

### Select

下拉选择框组件，基于 Headless UI 实现。

**Props:**
```typescript
interface SelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  error?: string
  placeholder?: string
}
```

**使用示例:**
```tsx
import { Select } from './components/ui/Select'

const [value, setValue] = useState('')

<Select
  label="选择主题"
  value={value}
  onChange={setValue}
  options={[
    { value: 'light', label: '亮色' },
    { value: 'dark', label: '暗色' },
    { value: 'system', label: '跟随系统' }
  ]}
  placeholder="请选择主题"
/>
```

### Checkbox

复选框组件。

**Props:**
```typescript
interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  description?: string
}
```

**使用示例:**
```tsx
import { Checkbox } from './components/ui/Checkbox'

<Checkbox 
  label="记住我" 
  description="下次自动登录"
/>
```

### Badge

徽章组件，支持多种变体和尺寸。

**Props:**
```typescript
interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}
```

**使用示例:**
```tsx
import { Badge } from './components/ui/Badge'

<Badge>默认</Badge>
<Badge variant="primary">主要</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
<Badge variant="danger">危险</Badge>
<Badge variant="info">信息</Badge>

<Badge size="sm">小徽章</Badge>
<Badge size="md">中徽章</Badge>
<Badge size="lg">大徽章</Badge>
```

### Tooltip

提示框组件，支持四个方向。

**Props:**
```typescript
interface TooltipProps {
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}
```

**使用示例:**
```tsx
import { Tooltip } from './components/ui/Tooltip'

<Tooltip content="这是一个提示" position="top">
  <button>悬停查看提示</button>
</Tooltip>
```

### Card

卡片容器组件。

**Props:**
```typescript
interface CardProps {
  className?: string
  children: React.ReactNode
}

interface CardHeaderProps {
  className?: string
  children: React.ReactNode
}

interface CardContentProps {
  className?: string
  children: React.ReactNode
}

interface CardFooterProps {
  className?: string
  children: React.ReactNode
}
```

**使用示例:**
```tsx
import { Card, CardHeader, CardContent, CardFooter } from './components/ui/Card'

<Card>
  <CardHeader>
    <h3>卡片标题</h3>
  </CardHeader>
  <CardContent>
    <p>卡片内容</p>
  </CardContent>
  <CardFooter>
    <Button>操作</Button>
  </CardFooter>
</Card>
```

### Modal

模态框组件，基于 Headless UI 实现，使用玻璃拟态效果。

**Props:**
```typescript
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}
```

**使用示例:**
```tsx
import { Modal } from './components/ui/Modal'
import { Button } from './components/ui/Button'

const [isOpen, setIsOpen] = useState(false)

<>
  <Button onClick={() => setIsOpen(true)}>打开模态框</Button>
  
  <Modal
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    title="确认操作"
    footer={
      <>
        <Button variant="ghost" onClick={() => setIsOpen(false)}>
          取消
        </Button>
        <Button onClick={() => setIsOpen(false)}>
          确认
        </Button>
      </>
    }
  >
    <p>确定要执行此操作吗？</p>
  </Modal>
</>
```

---

## 主题系统

### ThemeProvider

主题提供者组件，管理应用主题状态。

**使用示例:**
```tsx
import { ThemeProvider } from './components/providers/ThemeProvider'

function App() {
  return (
    <ThemeProvider>
      <YourApp />
    </ThemeProvider>
  )
}
```

### useTheme Hook

主题管理 Hook。

**返回值:**
```typescript
interface ThemeContextType {
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  resolvedTheme: 'light' | 'dark'
}
```

**使用示例:**
```tsx
import { useTheme } from './components/providers/ThemeProvider'

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  
  return (
    <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      当前主题: {resolvedTheme}
    </button>
  )
}
```

---

## 状态管理

### useAppStore Hook

全局应用状态管理 Hook，基于 Zustand 实现。

**状态定义:**
```typescript
interface AppState {
  // 主题
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  
  // UI 状态
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  
  // Workspace 管理
  currentWorkspace: WorkspaceInfo | null
  recentWorkspaces: RecentWorkspace[]
  setCurrentWorkspace: (workspace: WorkspaceInfo | null) => void
  addRecentWorkspace: (workspace: RecentWorkspace) => void
  
  // 文件管理
  currentFile: FileInfo | null
  openFiles: FileInfo[]
  setCurrentFile: (file: FileInfo | null) => void
  addOpenFile: (file: FileInfo) => void
  removeOpenFile: (fileId: string) => void
  
  // 加载和错误状态
  isLoading: boolean
  error: string | null
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}
```

**使用示例:**
```tsx
import { useAppStore } from './store/appStore'

function MyComponent() {
  // 使用选择器优化性能
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  
  // 或直接使用
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  
  return (
    <div>
      <button onClick={toggleSidebar}>
        {sidebarCollapsed ? '展开' : '折叠'}
      </button>
    </div>
  )
}
```

**性能优化建议:**
- 使用选择器只订阅需要的状态，避免不必要的重渲染
- 状态已持久化到 localStorage，主题和侧边栏状态会自动保存

---

## 工具函数

### cn

类名合并工具函数，基于 clsx 和 tailwind-merge。

**使用示例:**
```tsx
import { cn } from './utils/cn'

<div className={cn(
  'base-class',
  isActive && 'active-class',
  className
)}>
  内容
</div>
```

---

## 样式系统

### Notion 配色方案

**亮色模式:**
```css
--notion-bg-primary: #FFFFFF
--notion-bg-secondary: #F7F6F3
--notion-text-primary: #37352F
--notion-text-secondary: #787774
--notion-border-light: #E9E9E7
--notion-border-default: #D3D2CE
--notion-accent: #2383E2
```

**暗色模式:**
```css
--dark-bg-primary: #191919
--dark-bg-secondary: #252525
--dark-text-primary: #FFFFFF
--dark-text-secondary: #B4B4B4
--dark-border-light: #2F2F2F
--dark-border-default: #3F3F3F
```

### 玻璃拟态效果

使用 `.glass` 类应用玻璃拟态效果：

```tsx
<div className="glass">
  玻璃拟态容器
</div>
```

CSS 定义：
```css
.glass {
  @apply bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl;
  @apply border border-white/30 dark:border-white/10 shadow-lg;
}
```

---

## 响应式设计

所有组件支持以下断点：

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

使用 TailwindCSS 响应式前缀：
```tsx
<div className="w-full md:w-1/2 lg:w-1/3">
  响应式容器
</div>
```

---

## 可访问性

所有组件遵循 WCAG 2.1 AA 标准：

- **键盘导航**: 所有交互元素支持键盘操作
- **焦点管理**: 清晰的焦点指示器
- **ARIA 属性**: 适当的 ARIA 标签和角色
- **颜色对比度**: 文本对比度 ≥ 4.5:1

---

## 最佳实践

### 1. 组件导入

统一从 `ui/index.ts` 导入组件：

```tsx
import { Button, Input, Modal } from './components/ui'
```

### 2. 类型安全

始终使用 TypeScript 类型定义：

```tsx
import type { ButtonProps } from './components/ui/Button'

const MyButton: React.FC<ButtonProps> = (props) => {
  return <Button {...props} />
}
```

### 3. 性能优化

- 使用 `React.memo` 包装纯组件
- 使用 `useCallback` 缓存事件处理器
- 使用选择器订阅 Zustand 状态

### 4. 主题适配

确保自定义组件支持暗色模式：

```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
  主题适配内容
</div>
```

---

## 示例页面

项目包含以下示例页面，展示所有组件的使用方法：

- **ComponentShowcase**: 基础 UI 组件展示
- **ThemeShowcase**: 主题系统展示
- **LayoutShowcase**: 布局组件展示
- **UIComponentsShowcase**: 通用 UI 组件展示

访问这些页面查看完整的组件使用示例。

---

## 常见问题

### Q: 如何自定义主题颜色？

A: 修改 `tailwind.config.js` 中的 `theme.extend.colors` 配置。

### Q: 如何添加新的组件变体？

A: 在组件的 `variants` 对象中添加新的样式类，并更新 TypeScript 类型定义。

### Q: 组件不支持暗色模式怎么办？

A: 确保使用了 `dark:` 前缀的 TailwindCSS 类，并在根元素添加了 `dark` 类。

### Q: 如何优化组件性能？

A: 使用 `React.memo`、`useCallback`、`useMemo` 和 Zustand 选择器。

---

## 更新日志

### v1.0.0 (2026-03-10)

- ✅ 完成基础 UI 框架集成
- ✅ 实现 Notion 风格设计系统
- ✅ 支持亮色/暗色主题切换
- ✅ 实现玻璃拟态效果
- ✅ 完成所有基础组件
- ✅ 实现 Zustand 状态管理
- ✅ 完成响应式布局
- ✅ 通过 TypeScript 类型检查

---

**最后更新:** 2026-03-10  
**维护者:** Sibylla Team
