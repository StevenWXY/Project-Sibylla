import React from 'react'
import { useTheme } from '../components/providers/ThemeProvider'
import { Sun, Moon, Monitor, Palette } from 'lucide-react'
import { Button } from '../components/ui'

/**
 * 主题展示页面
 * 用于测试和展示主题系统的功能
 */
export function ThemeShowcase() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-notion-text-primary dark:text-white mb-2">
          主题系统展示
        </h1>
        <p className="text-notion-text-secondary dark:text-gray-400">
          测试 Notion 风格的亮色/暗色主题切换功能
        </p>
      </div>

      {/* 当前主题状态 */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="text-notion-accent" size={24} />
          <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white">
            当前主题状态
          </h2>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-notion-bg-secondary dark:bg-gray-700">
            <div className="text-sm text-notion-text-secondary dark:text-gray-400 mb-1">
              主题设置
            </div>
            <div className="text-lg font-semibold text-notion-text-primary dark:text-white">
              {theme === 'light' && '亮色模式'}
              {theme === 'dark' && '暗色模式'}
              {theme === 'system' && '跟随系统'}
            </div>
          </div>
          
          <div className="p-4 rounded-lg bg-notion-bg-secondary dark:bg-gray-700">
            <div className="text-sm text-notion-text-secondary dark:text-gray-400 mb-1">
              实际显示
            </div>
            <div className="text-lg font-semibold text-notion-text-primary dark:text-white">
              {resolvedTheme === 'light' ? '亮色' : '暗色'}
            </div>
          </div>
        </div>
      </div>

      {/* 主题切换按钮 */}
      <div className="card">
        <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-4">
          主题切换
        </h2>
        
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setTheme('light')}
            className={`p-6 rounded-lg border-2 transition-all ${
              theme === 'light'
                ? 'border-notion-accent bg-notion-accent/10'
                : 'border-notion-border-default hover:border-notion-accent/50 dark:border-gray-600'
            }`}
          >
            <Sun 
              size={32} 
              className={`mx-auto mb-3 ${
                theme === 'light' 
                  ? 'text-notion-accent' 
                  : 'text-notion-text-secondary dark:text-gray-400'
              }`}
            />
            <div className="text-center font-medium text-notion-text-primary dark:text-white">
              亮色模式
            </div>
            <div className="text-center text-sm text-notion-text-secondary dark:text-gray-400 mt-1">
              Light Theme
            </div>
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={`p-6 rounded-lg border-2 transition-all ${
              theme === 'dark'
                ? 'border-notion-accent bg-notion-accent/10'
                : 'border-notion-border-default hover:border-notion-accent/50 dark:border-gray-600'
            }`}
          >
            <Moon 
              size={32} 
              className={`mx-auto mb-3 ${
                theme === 'dark' 
                  ? 'text-notion-accent' 
                  : 'text-notion-text-secondary dark:text-gray-400'
              }`}
            />
            <div className="text-center font-medium text-notion-text-primary dark:text-white">
              暗色模式
            </div>
            <div className="text-center text-sm text-notion-text-secondary dark:text-gray-400 mt-1">
              Dark Theme
            </div>
          </button>

          <button
            onClick={() => setTheme('system')}
            className={`p-6 rounded-lg border-2 transition-all ${
              theme === 'system'
                ? 'border-notion-accent bg-notion-accent/10'
                : 'border-notion-border-default hover:border-notion-accent/50 dark:border-gray-600'
            }`}
          >
            <Monitor 
              size={32} 
              className={`mx-auto mb-3 ${
                theme === 'system' 
                  ? 'text-notion-accent' 
                  : 'text-notion-text-secondary dark:text-gray-400'
              }`}
            />
            <div className="text-center font-medium text-notion-text-primary dark:text-white">
              跟随系统
            </div>
            <div className="text-center text-sm text-notion-text-secondary dark:text-gray-400 mt-1">
              System Theme
            </div>
          </button>
        </div>
      </div>

      {/* 颜色展示 */}
      <div className="card">
        <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-4">
          Notion 配色方案
        </h2>
        
        <div className="space-y-4">
          {/* 背景色 */}
          <div>
            <div className="text-sm font-medium text-notion-text-secondary dark:text-gray-400 mb-2">
              背景色
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-notion-bg-primary border border-notion-border-light dark:bg-gray-950 dark:border-gray-700">
                <div className="text-xs text-notion-text-secondary dark:text-gray-400">Primary</div>
                <div className="text-sm font-mono text-notion-text-primary dark:text-white mt-1">
                  {resolvedTheme === 'light' ? '#FFFFFF' : '#191919'}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-notion-bg-secondary border border-notion-border-light dark:bg-gray-900 dark:border-gray-700">
                <div className="text-xs text-notion-text-secondary dark:text-gray-400">Secondary</div>
                <div className="text-sm font-mono text-notion-text-primary dark:text-white mt-1">
                  {resolvedTheme === 'light' ? '#F7F6F3' : '#252525'}
                </div>
              </div>
            </div>
          </div>

          {/* 文本色 */}
          <div>
            <div className="text-sm font-medium text-notion-text-secondary dark:text-gray-400 mb-2">
              文本色
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-notion-bg-secondary dark:bg-gray-800">
                <div className="text-notion-text-primary dark:text-white font-semibold">
                  主要文本
                </div>
                <div className="text-xs font-mono text-notion-text-secondary dark:text-gray-400 mt-1">
                  {resolvedTheme === 'light' ? '#37352F' : '#FFFFFF'}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-notion-bg-secondary dark:bg-gray-800">
                <div className="text-notion-text-secondary dark:text-gray-400">
                  次要文本
                </div>
                <div className="text-xs font-mono text-notion-text-secondary dark:text-gray-400 mt-1">
                  {resolvedTheme === 'light' ? '#787774' : '#B4B4B4'}
                </div>
              </div>
            </div>
          </div>

          {/* 强调色 */}
          <div>
            <div className="text-sm font-medium text-notion-text-secondary dark:text-gray-400 mb-2">
              强调色
            </div>
            <div className="p-4 rounded-lg bg-notion-accent text-white">
              <div className="font-semibold">Notion 蓝</div>
              <div className="text-xs font-mono mt-1 opacity-90">#2383E2</div>
            </div>
          </div>
        </div>
      </div>

      {/* 玻璃拟态效果展示 */}
      <div className="card">
        <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-4">
          玻璃拟态效果
        </h2>
        
        <div className="relative h-64 rounded-lg overflow-hidden bg-gradient-to-br from-notion-accent/20 to-purple-500/20 dark:from-notion-accent/30 dark:to-purple-500/30">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="glass p-8 rounded-2xl max-w-md">
              <h3 className="text-lg font-semibold text-notion-text-primary dark:text-white mb-2">
                玻璃拟态卡片
              </h3>
              <p className="text-notion-text-secondary dark:text-gray-400 mb-4">
                使用 backdrop-filter: blur() 实现的毛玻璃效果，在亮色和暗色模式下都有良好的视觉效果。
              </p>
              <Button variant="primary" size="sm">
                了解更多
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 组件在不同主题下的表现 */}
      <div className="card">
        <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-4">
          组件主题适配
        </h2>
        
        <div className="space-y-4">
          <div className="flex gap-3">
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="ghost">Ghost Button</Button>
          </div>
          
          <div className="p-4 rounded-lg bg-notion-bg-secondary dark:bg-gray-800">
            <p className="text-notion-text-primary dark:text-white">
              所有组件都会自动适配当前主题，无需额外配置。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
