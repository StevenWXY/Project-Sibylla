import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useOnboardingStore, type UserType } from '../../store/onboardingStore'
import { useAIChatStore } from '../../store/aiChatStore'
import { StudioAIPanel } from '../studio/StudioAIPanel'

function getSuggestedQuestions(
  userType: UserType,
  hasImportedData: boolean
): string[] {
  if (!hasImportedData) {
    return [
      'Sibylla 能帮我做什么？',
      '帮我创建一个示例项目计划',
      '介绍一下你的核心功能',
    ]
  }

  switch (userType) {
    case 'student':
      return [
        '帮我整理一下我的论文笔记的核心观点',
        '我这学期的课程重点是什么？',
        '帮我制定一个论文写作计划',
      ]
    case 'crypto':
      return [
        '总结一下我们 DAO 目前的治理进展',
        '帮我梳理白皮书的核心技术路线',
        '团队当前的优先事项是什么？',
      ]
    case 'startup':
      return [
        '我们项目目前的整体状况是什么？',
        '总结一下我的核心目标和挑战',
        '帮我梳理一下待办事项的优先级',
      ]
    default:
      return [
        '我们项目目前的整体状况是什么？',
        '总结一下我的核心目标和挑战',
        '帮我梳理一下待办事项的优先级',
      ]
  }
}

export function FirstChatStep() {
  const userType = useOnboardingStore((s) => s.userType)
  const importResult = useOnboardingStore((s) => s.importResult)
  const setFirstChatCompleted = useOnboardingStore((s) => s.setFirstChatCompleted)
  const nextStep = useOnboardingStore((s) => s.nextStep)

  const messages = useAIChatStore((s) => s.messages)
  const isStreaming = useAIChatStore((s) => s.isStreaming)
  const addUserMessage = useAIChatStore((s) => s.addUserMessage)
  const resetChat = useAIChatStore((s) => s.reset)

  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')

  const suggestedQuestions = getSuggestedQuestions(userType, !!importResult)

  const handleSelectQuestion = (question: string) => {
    setSelectedQuestion(question)
    addUserMessage(question)
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    setSelectedQuestion(chatInput)
    addUserMessage(chatInput)
    setChatInput('')
  }

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && !isStreaming && !lastMessage.streaming) {
      setFirstChatCompleted()
    }
  }, [messages, isStreaming, setFirstChatCompleted])

  const hasCompletedChat = messages.some((m) => m.role === 'assistant')

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="w-full max-w-4xl h-[600px] flex flex-col"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        和你的 AI 助手打个招呼
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        {importResult
          ? 'AI 已经阅读了你导入的所有文件，试试问它一个问题'
          : '试试和 AI 对话，体验 Sibylla 的能力'}
      </p>

      {!selectedQuestion ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            点击下方问题快速开始：
          </p>
          {suggestedQuestions.map((question, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleSelectQuestion(question)}
              className="w-full p-4 text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors"
            >
              <p className="text-gray-900 dark:text-gray-100">{question}</p>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <StudioAIPanel
            messages={messages}
            isStreaming={isStreaming}
            chatInput={chatInput}
            onChatInputChange={setChatInput}
            onSendMessage={handleSendMessage}
            onStopStreaming={() => {}}
            onNewSession={resetChat}
            onLoadMoreHistory={() => {}}
            hasMoreHistory={false}
            isLoadingHistory={false}
          />
        </div>
      )}

      {hasCompletedChat && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex justify-end"
        >
          <button
            onClick={nextStep}
            className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            下一步
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}
