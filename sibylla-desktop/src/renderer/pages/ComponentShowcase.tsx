import React, { useState } from 'react'
import { Button, Input, Modal } from '../components/ui'
import { Home, FileText, Settings, Plus, Save, Trash2 } from 'lucide-react'

export function ComponentShowcase() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = () => {
    if (!inputValue.trim()) {
      setInputError('此字段不能为空')
      return
    }
    setInputError('')
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setIsModalOpen(false)
      setInputValue('')
    }, 2000)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-notion-text-primary dark:text-white">
          UI 组件展示
        </h1>
        <p className="mt-2 text-notion-text-secondary dark:text-gray-400">
          Sibylla 基础 UI 组件库 - Notion 风格设计
        </p>
      </div>

      {/* Buttons Section */}
      <section className="card">
        <h2 className="mb-4 text-xl font-semibold text-notion-text-primary dark:text-white">
          按钮组件
        </h2>
        
        <div className="space-y-4">
          {/* Variants */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              按钮变体
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="outline">Outline Button</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="danger">Danger Button</Button>
            </div>
          </div>

          {/* Sizes */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              按钮尺寸
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>

          {/* With Icons */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              带图标的按钮
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button icon={<Plus className="h-4 w-4" />}>新建</Button>
              <Button variant="secondary" icon={<Save className="h-4 w-4" />}>
                保存
              </Button>
              <Button variant="danger" icon={<Trash2 className="h-4 w-4" />}>
                删除
              </Button>
            </div>
          </div>

          {/* Loading State */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              加载状态
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button loading>Loading...</Button>
              <Button variant="secondary" loading>
                Processing
              </Button>
            </div>
          </div>

          {/* Disabled State */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              禁用状态
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button disabled>Disabled Button</Button>
              <Button variant="secondary" disabled>
                Disabled Secondary
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Inputs Section */}
      <section className="card">
        <h2 className="mb-4 text-xl font-semibold text-notion-text-primary dark:text-white">
          输入框组件
        </h2>
        
        <div className="space-y-4">
          {/* Basic Input */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              基础输入框
            </h3>
            <Input placeholder="请输入内容..." />
          </div>

          {/* With Label */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              带标签的输入框
            </h3>
            <Input label="用户名" placeholder="请输入用户名" />
          </div>

          {/* With Helper Text */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              带辅助文本
            </h3>
            <Input
              label="邮箱地址"
              placeholder="example@email.com"
              helperText="我们不会分享您的邮箱地址"
            />
          </div>

          {/* With Error */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              错误状态
            </h3>
            <Input
              label="密码"
              type="password"
              placeholder="请输入密码"
              error="密码长度至少为8个字符"
            />
          </div>

          {/* Disabled */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-notion-text-secondary dark:text-gray-400">
              禁用状态
            </h3>
            <Input label="只读字段" value="不可编辑的内容" disabled />
          </div>
        </div>
      </section>

      {/* Modal Section */}
      <section className="card">
        <h2 className="mb-4 text-xl font-semibold text-notion-text-primary dark:text-white">
          模态框组件
        </h2>
        
        <div className="space-y-4">
          <p className="text-sm text-notion-text-secondary dark:text-gray-400">
            点击按钮打开不同尺寸的模态框
          </p>
          
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setIsModalOpen(true)}>打开模态框</Button>
          </div>
        </div>
      </section>

      {/* Glass Effect Section */}
      <section className="card">
        <h2 className="mb-4 text-xl font-semibold text-notion-text-primary dark:text-white">
          玻璃拟态效果
        </h2>
        
        <div className="space-y-4">
          <p className="text-sm text-notion-text-secondary dark:text-gray-400">
            玻璃拟态效果应用于侧边栏、头部和模态框
          </p>
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="glass rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5 text-notion-accent" />
                <span className="font-medium">玻璃卡片 1</span>
              </div>
              <p className="mt-2 text-sm text-notion-text-secondary dark:text-gray-400">
                带有模糊背景的卡片效果
              </p>
            </div>
            
            <div className="glass rounded-lg p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-notion-accent" />
                <span className="font-medium">玻璃卡片 2</span>
              </div>
              <p className="mt-2 text-sm text-notion-text-secondary dark:text-gray-400">
                半透明效果与边框
              </p>
            </div>
            
            <div className="glass rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-notion-accent" />
                <span className="font-medium">玻璃卡片 3</span>
              </div>
              <p className="mt-2 text-sm text-notion-text-secondary dark:text-gray-400">
                现代化的视觉效果
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Modal Component */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setInputValue('')
          setInputError('')
        }}
        title="示例模态框"
        description="这是一个使用玻璃拟态效果的模态框组件"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="输入内容"
            placeholder="请输入一些内容..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            error={inputError}
          />
          
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setIsModalOpen(false)
                setInputValue('')
                setInputError('')
              }}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} loading={isLoading}>
              确认
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
