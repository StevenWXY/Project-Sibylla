import React from 'react'
import { useAppStore, selectSidebarCollapsed } from '../../store/appStore'
import { ChevronLeft, ChevronRight, Home, FileText, Settings, Brain } from 'lucide-react'
import { cn } from '../../utils/cn'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'

/**
 * Sidebar - 侧边栏导航组件
 * 
 * 特性：
 * - 玻璃拟态设计（backdrop-filter blur）
 * - 可折叠（64px ↔ 16px）
 * - 平滑过渡动画（300ms ease-in-out）
 * - 响应式图标和文本显示
 * - 键盘导航支持
 * 
 * 性能优化：
 * - 使用 Zustand 选择器最小化重渲染
 * - CSS transitions 而非 JS 动画
 * - 子组件使用 React.memo 优化
 * 
 * 无障碍：
 * - aria-label 提供屏幕阅读器支持
 * - title 属性在折叠时显示完整标签
 * - 键盘可访问的按钮
 */
export function Sidebar() {
  const sidebarCollapsed = useAppStore(selectSidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  
  return (
    <aside 
      className={cn(
        'fixed left-0 top-0 h-full z-40',
        'glass border-r border-white/10',
        'transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
      aria-label="主导航"
    >
      <div className="flex h-full flex-col">
        {/* Logo 区域 */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 transition-opacity duration-200">
              <PixelOctoIcon className="h-6 w-6 text-white" />
              <span className="font-mono text-base font-bold tracking-widest text-white">
                &lt;SIBYLLA/&gt;
              </span>
            </div>
          )}
          {sidebarCollapsed && <PixelOctoIcon className="h-6 w-6 text-white" />}
          <button
            onClick={toggleSidebar}
            className={cn(
              'rounded-lg p-1.5 transition-colors',
              'hover:bg-sys-darkSurface',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              sidebarCollapsed && 'mx-auto'
            )}
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={20} className="text-sys-darkMuted" />
            ) : (
              <ChevronLeft size={20} className="text-sys-darkMuted" />
            )}
          </button>
        </div>
        
        {/* 导航菜单 */}
        <nav className="flex-1 overflow-y-auto p-2 scrollbar-thin" aria-label="主菜单">
          <SidebarItem 
            icon={<Home size={20} />} 
            label="首页" 
            collapsed={sidebarCollapsed}
            active={true}
          />
          <SidebarItem 
            icon={<FileText size={20} />} 
            label="文档" 
            collapsed={sidebarCollapsed} 
          />
          <SidebarItem 
            icon={<Brain size={20} />} 
            label="精选记忆" 
            collapsed={sidebarCollapsed} 
          />
          <SidebarItem 
            icon={<Settings size={20} />} 
            label="设置" 
            collapsed={sidebarCollapsed} 
          />
        </nav>
      </div>
    </aside>
  )
}

/**
 * SidebarItem - 侧边栏导航项
 * 
 * 使用 React.memo 优化性能，避免父组件重渲染时不必要的更新
 */
interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  collapsed: boolean
  active?: boolean
  onClick?: () => void
}

const SidebarItem = React.memo(function SidebarItem({ 
  icon, 
  label, 
  collapsed, 
  active = false,
  onClick 
}: SidebarItemProps) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 mb-1',
        'text-sys-darkMuted',
        'transition-all duration-200',
        'hover:bg-sys-darkSurface hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        active && 'bg-white text-black font-semibold',
        collapsed && 'justify-center'
      )}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && (
        <span className="text-sm truncate transition-opacity duration-200">
          {label}
        </span>
      )}
    </button>
  )
})
