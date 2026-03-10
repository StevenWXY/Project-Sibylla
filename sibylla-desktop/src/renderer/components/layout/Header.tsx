import React from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../providers/ThemeProvider'
import { cn } from '../../utils/cn'

/**
 * Header - 顶部导航栏组件
 * 
 * 特性：
 * - 玻璃拟态设计
 * - 三态主题切换（light → dark → system）
 * - 响应式布局
 * - 平滑过渡动画
 * 
 * 性能优化：
 * - 使用 React.memo 避免不必要的重渲染
 * - 主题图标和标签通过函数计算，避免额外状态
 * 
 * 无障碍：
 * - aria-label 和 title 提供完整的主题状态信息
 * - 键盘可访问
 * - 焦点可见状态
 */
export const Header = React.memo(function Header() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  
  /**
   * 三态主题切换：light → dark → system → light
   */
  const cycleTheme = React.useCallback(() => {
    const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themeOrder.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themeOrder.length
    const nextTheme = themeOrder[nextIndex]
    if (nextTheme) {
      setTheme(nextTheme)
    }
  }, [theme, setTheme])
  
  /**
   * 获取主题图标
   */
  const getThemeIcon = () => {
    if (theme === 'system') {
      return <Monitor size={20} className="text-notion-text-secondary dark:text-gray-400" />
    }
    return resolvedTheme === 'dark'
      ? <Moon size={20} className="text-notion-text-secondary dark:text-gray-400" />
      : <Sun size={20} className="text-notion-text-secondary dark:text-gray-400" />
  }
  
  /**
   * 获取主题标签
   */
  const getThemeLabel = () => {
    const labels = {
      light: '亮色模式',
      dark: '暗色模式',
      system: '跟随系统'
    }
    return `当前: ${labels[theme]}`
  }
  
  /**
   * 获取简短主题文本
   */
  const getThemeText = () => {
    const texts = {
      light: '亮色',
      dark: '暗色',
      system: '跟随系统'
    }
    return texts[theme]
  }
  
  return (
    <header className="flex h-14 items-center justify-between px-6 glass border-b border-notion-border-light dark:border-gray-700 shrink-0 z-30">
      {/* 左侧：标题区域 */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-notion-text-primary dark:text-white">
          Workspace
        </h1>
      </div>
      
      {/* 右侧：主题切换按钮 */}
      <button
        onClick={cycleTheme}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2',
          'transition-colors duration-200',
          'hover:bg-notion-bg-secondary dark:hover:bg-gray-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-accent'
        )}
        aria-label={getThemeLabel()}
        title={getThemeLabel()}
      >
        {getThemeIcon()}
        <span className="text-xs text-notion-text-secondary dark:text-gray-400">
          {getThemeText()}
        </span>
      </button>
    </header>
  )
})
