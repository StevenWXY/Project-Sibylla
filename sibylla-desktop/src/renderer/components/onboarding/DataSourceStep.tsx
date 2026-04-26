import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Folder, Database, BookOpen, Sparkles } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'

const dataSources = [
  {
    id: 'notion',
    icon: Database,
    title: 'Notion 导出包',
    description: '导入页面层级和数据库',
  },
  {
    id: 'google-docs',
    icon: FileText,
    title: 'Google Docs',
    description: '导入文档和表格',
  },
  {
    id: 'obsidian',
    icon: BookOpen,
    title: 'Obsidian Vault',
    description: '保留 wikilinks 和标签',
  },
  {
    id: 'local-folder',
    icon: Folder,
    title: '本地文件夹',
    description: '直接复制 Markdown 文件',
  },
  {
    id: 'blank',
    icon: Sparkles,
    title: '空白开始',
    description: '从示例工作区开始体验',
  },
]

export function DataSourceStep() {
  const nextStep = useOnboardingStore((s) => s.nextStep)
  const skipTo = useOnboardingStore((s) => s.skipTo)
  const setSelectedDataSources = useOnboardingStore((s) => s.setSelectedDataSources)
  const [selected, setSelected] = useState<string[]>([])

  const handleToggle = (id: string) => {
    if (id === 'blank') {
      setSelected(['blank'])
      setSelectedDataSources(['blank'])
      try {
        window.electronAPI.file.copy(
          'sample-workspace://',
          '/'
        )
      } catch {
        // sample workspace copy is best-effort
      }
      skipTo(5)
      return
    }

    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev.filter((s) => s !== 'blank'), id]
    )
  }

  const handleNext = () => {
    setSelectedDataSources(selected)
    nextStep()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="w-full max-w-2xl"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        选择要导入的数据源
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        可多选，也可稍后再导入
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {dataSources.map((source, index) => (
          <motion.button
            key={source.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => handleToggle(source.id)}
            className={`
              p-6 rounded-lg border-2 text-left transition-all
              ${
                selected.includes(source.id)
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <div className="flex items-start gap-4">
              <source.icon
                className={`w-8 h-8 flex-shrink-0 ${
                  selected.includes(source.id) ? 'text-indigo-500' : 'text-gray-400'
                }`}
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {source.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {source.description}
                </p>
              </div>
              {selected.includes(source.id) && (
                <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm">✓</span>
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => skipTo(5)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          跳过
        </button>
        <button
          onClick={handleNext}
          disabled={selected.length === 0}
          className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          下一步
        </button>
      </div>
    </motion.div>
  )
}
