import React from 'react'
import { useAppStore, selectSidebarCollapsed } from '../../store/appStore'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MainContent } from './MainContent'
import { cn } from '../../utils/cn'

/**
 * AppLayout - 应用主布局组件
 * 
 * 采用 Notion 风格的三栏布局：
 * - 左侧：可折叠的侧边栏（64px 展开 / 16px 收起）
 * - 顶部：固定高度的 Header（56px）
 * - 中间：可滚动的主内容区
 * 
 * 性能优化：
 * - 使用 Zustand 选择器避免不必要的重渲染
 * - CSS transitions 实现流畅的折叠动画
 * - 固定布局避免 layout shift
 * 
 * @example
 * <AppLayout>
 *   <YourPageContent />
 * </AppLayout>
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useAppStore(selectSidebarCollapsed)
  
  return (
    <div className="sibylla-shell flex h-screen overflow-hidden">
      {/* 侧边栏 - 固定定位 */}
      <Sidebar />
      
      {/* 主内容区 - 根据侧边栏状态调整左边距 */}
      <div className={cn(
        'relative z-10 flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'ml-16' : 'ml-64'
      )}>
        <Header />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  )
}
