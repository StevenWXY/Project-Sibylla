import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, FileText, CheckSquare, Settings } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'
import { useAppStore } from '../../store/appStore'

export function CompletionStep() {
  const importResult = useOnboardingStore((s) => s.importResult)
  const connectedTools = useOnboardingStore((s) => s.connectedTools)
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding)
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted)

  const successCount = importResult
    ? importResult.imported.length + importResult.converted.length
    : 0

  const handleComplete = async () => {
    await completeOnboarding()
    setOnboardingCompleted(true)
  }

  const nextSteps = [
    {
      icon: FileText,
      title: '写第一条笔记',
      description: '记录你的想法和灵感',
    },
    {
      icon: CheckSquare,
      title: '创建第一个任务',
      description: '开始管理你的待办事项',
    },
    {
      icon: Settings,
      title: '探索更多工具',
      description: '连接更多外部服务',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-2xl text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="mb-8"
      >
        <Sparkles className="w-24 h-24 text-indigo-500 mx-auto" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4"
      >
        🎉 Sibylla 已经了解你了！
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-lg text-gray-600 dark:text-gray-400 mb-8"
      >
        {successCount > 0 && `已导入 ${successCount} 个文件`}
        {connectedTools.length > 0 &&
          `，连接了 ${connectedTools.length} 个工具`}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
      >
        {nextSteps.map((step) => (
          <div
            key={step.title}
            className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <step.icon className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {step.description}
            </p>
          </div>
        ))}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        onClick={handleComplete}
        className="px-8 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-lg transition-colors"
      >
        进入工作区
      </motion.button>
    </motion.div>
  )
}
