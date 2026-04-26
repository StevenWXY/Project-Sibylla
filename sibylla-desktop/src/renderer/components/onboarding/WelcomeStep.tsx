import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, Lock, Zap } from 'lucide-react'
import { useOnboardingStore, detectUserType } from '../../store/onboardingStore'
import { useAppStore } from '../../store/appStore'

export function WelcomeStep() {
  const nextStep = useOnboardingStore((s) => s.nextStep)
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding)
  const setUserType = useOnboardingStore((s) => s.setUserType)
  const currentUser = useAppStore((s) => s.currentUser)

  useEffect(() => {
    if (currentUser) {
      const detected = detectUserType({
        email: currentUser.email ?? undefined,
        loginMethod: undefined,
      })
      setUserType(detected)
    }
  }, [currentUser, setUserType])

  const features = [
    {
      icon: Lock,
      title: '本地优先',
      description: '你的数据始终在你手中，完全离线可用',
    },
    {
      icon: Brain,
      title: '全局理解',
      description: 'AI 拥有你整个团队的完整记忆',
    },
    {
      icon: Zap,
      title: '外部连接',
      description: '连接 GitHub、Slack 等工具扩展能力',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center"
    >
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4"
      >
        欢迎使用 Sibylla
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-lg text-gray-600 dark:text-gray-400 mb-12"
      >
        让我们 3 分钟完成设置
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 w-full max-w-3xl">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <feature.icon className="w-12 h-12 text-indigo-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {feature.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex gap-4"
      >
        <button
          onClick={nextStep}
          className="px-8 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          开始设置
        </button>
        <button
          onClick={() => { completeOnboarding() }}
          className="px-8 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          跳过设置
        </button>
      </motion.div>
    </motion.div>
  )
}
