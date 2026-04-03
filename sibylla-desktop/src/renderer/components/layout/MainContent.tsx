import React from 'react'

/**
 * MainContent - 主内容区域组件
 * 
 * 特性：
 * - 可滚动的内容区域
 * - Notion 风格的背景色
 * - 适当的内边距
 * - 响应式设计
 * 
 * 性能优化：
 * - 使用 React.memo 避免不必要的重渲染
 * - overflow-y-auto 仅在需要时显示滚动条
 * 
 * 布局：
 * - flex-1 占据剩余空间
 * - p-6 提供舒适的内边距
 * - 背景色与 Notion 保持一致
 * 
 * @example
 * <MainContent>
 *   <YourPageContent />
 * </MainContent>
 */
export const MainContent = React.memo(function MainContent({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <main className="relative z-10 flex-1 overflow-y-auto bg-transparent p-6">
      {children}
    </main>
  )
})
