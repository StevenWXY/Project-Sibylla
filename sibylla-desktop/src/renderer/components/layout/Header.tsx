import React from 'react'
import { Sun, Moon, Monitor, Settings } from 'lucide-react'
import { useTheme } from '../providers/ThemeProvider'
import { cn } from '../../utils/cn'
import { useAppStore } from '../../store/appStore'
import { useTabStore, selectActiveTab } from '../../store/tabStore'
import { WorkspaceSettings } from '../settings/WorkspaceSettings'

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
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = React.useState(false)
  /* [S1-FIX] Use memoized selector to avoid re-renders when unrelated tabs change */
  const activeTab = useTabStore(selectActiveTab)
  
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
      return <Monitor size={20} className="text-sys-darkMuted" />
    }
    return resolvedTheme === 'dark'
      ? <Moon size={20} className="text-sys-darkMuted" />
      : <Sun size={20} className="text-sys-darkMuted" />
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
    <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/45 px-6 backdrop-blur-xl">
      {/* 左侧：标题区域 */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">
          Workspace
        </h1>
        {currentWorkspace && (
          <span className="rounded-md border border-white/10 bg-sys-black px-2 py-1 text-xs font-mono text-sys-darkMuted">
            {currentWorkspace.config.name}
          </span>
        )}
        {activeTab && (
          <span className="max-w-[220px] truncate text-xs text-sys-darkMuted">
            {activeTab.fileName}
          </span>
        )}
      </div>
      
      {/* 右侧：工作区设置 + 主题切换按钮 */}
      <div className="flex items-center gap-2">
        {currentWorkspace && (
          <button
            onClick={() => setShowWorkspaceSettings(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2',
              'transition-colors duration-200',
              'hover:bg-sys-darkSurface',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            )}
            aria-label="工作区设置"
            title="工作区设置"
          >
            <Settings size={18} className="text-sys-darkMuted" />
          </button>
        )}
        <button
          onClick={cycleTheme}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2',
            'transition-colors duration-200',
            'hover:bg-sys-darkSurface',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
          )}
          aria-label={getThemeLabel()}
          title={getThemeLabel()}
        >
          {getThemeIcon()}
          <span className="text-xs text-sys-darkMuted">
            {getThemeText()}
          </span>
        </button>
      </div>

      {showWorkspaceSettings && (
        <WorkspaceSettings
          isOpen={showWorkspaceSettings}
          onClose={() => setShowWorkspaceSettings(false)}
        />
      )}
    </header>
  )
})
