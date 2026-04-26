import React from 'react'
import { Sun, Moon, Monitor, Settings, Zap } from 'lucide-react'
import { useTheme } from '../providers/ThemeProvider'
import { cn } from '../../utils/cn'
import { useAppStore } from '../../store/appStore'
import { useTabStore, selectActiveTab } from '../../store/tabStore'
import { WorkspaceSettings } from '../settings/WorkspaceSettings'
import { McpSettingsPage } from '../mcp/McpSettingsPage'
import { ModelSwitcher } from '../header/ModelSwitcher'
import { QuickSettingsPanel } from '../header/QuickSettingsPanel'

export const Header = React.memo(function Header() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = React.useState(false)
  const [showQuickSettings, setShowQuickSettings] = React.useState(false)
  const [showMcpSettings, setShowMcpSettings] = React.useState(false)
  const activeTab = useTabStore(selectActiveTab)
  
  const cycleTheme = React.useCallback(() => {
    const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themeOrder.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themeOrder.length
    const nextTheme = themeOrder[nextIndex]
    if (nextTheme) {
      setTheme(nextTheme)
    }
  }, [theme, setTheme])
  
  const getThemeIcon = () => {
    if (theme === 'system') {
      return <Monitor size={20} className="text-sys-darkMuted" />
    }
    return resolvedTheme === 'dark'
      ? <Moon size={20} className="text-sys-darkMuted" />
      : <Sun size={20} className="text-sys-darkMuted" />
  }
  
  const getThemeLabel = () => {
    const labels = {
      light: '亮色模式',
      dark: '暗色模式',
      system: '跟随系统'
    }
    return `当前: ${labels[theme]}`
  }
  
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
      
      {/* 右侧：ModelSwitcher + MCP + QuickSettings + 主题切换 */}
      <div className="flex items-center gap-2">
        {currentWorkspace && <ModelSwitcher conversationId={activeTab?.id ?? 'default'} />}
        {currentWorkspace && (
          <button
            onClick={() => setShowMcpSettings(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2',
              'transition-colors duration-200',
              'hover:bg-sys-darkSurface',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            )}
            aria-label="MCP 集成管理"
            title="MCP 集成管理"
          >
            <Zap size={18} className="text-sys-darkMuted" />
          </button>
        )}
        <div className="relative">
          {currentWorkspace && (
            <button
              onClick={() => setShowQuickSettings(!showQuickSettings)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2',
                'transition-colors duration-200',
                'hover:bg-sys-darkSurface',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              )}
              aria-label="Quick settings"
              title="Quick settings"
            >
              <Settings size={18} className="text-sys-darkMuted" />
            </button>
          )}
          <QuickSettingsPanel
            open={showQuickSettings}
            onClose={() => setShowQuickSettings(false)}
          />
        </div>
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
          onClose={() => setShowWorkspaceSettings(false)}
        />
      )}

      {showMcpSettings && (
        <McpSettingsPage onClose={() => setShowMcpSettings(false)} />
      )}
    </header>
  )
})
