import React, { useState } from 'react'
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Badge,
  Tooltip,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Modal,
} from '../components/ui'
import { Info, Save, Trash2 } from 'lucide-react'

/**
 * UIComponentsShowcase - 展示所有通用 UI 组件
 * 
 * 本页面演示了 Sibylla 项目中所有可用的通用 UI 组件，
 * 包括表单组件、反馈组件和容器组件。
 */
export default function UIComponentsShowcase() {
  // Form states
  const [inputValue, setInputValue] = useState('')
  const [textareaValue, setTextareaValue] = useState('')
  const [selectValue, setSelectValue] = useState('')
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const selectOptions = [
    { value: 'option1', label: '选项 1' },
    { value: 'option2', label: '选项 2' },
    { value: 'option3', label: '选项 3' },
    { value: 'option4', label: '选项 4（禁用）', disabled: true },
  ]

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-notion-text-primary dark:text-white">
          UI 组件展示
        </h1>
        <p className="mt-2 text-notion-text-secondary dark:text-gray-400">
          展示所有可用的通用 UI 组件及其使用方式
        </p>
      </div>

      {/* Form Components Section */}
      <Card variant="glass">
        <CardHeader
          title="表单组件"
          description="输入框、文本域、选择框和复选框"
        />
        <CardContent>
          <div className="space-y-6">
            {/* Input */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Input 输入框
              </h4>
              <div className="space-y-3">
                <Input
                  label="基础输入框"
                  placeholder="请输入内容..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
                <Input
                  label="带辅助文本"
                  placeholder="example@email.com"
                  helperText="我们不会分享您的邮箱地址"
                />
                <Input
                  label="错误状态"
                  placeholder="请输入有效内容"
                  error="此字段为必填项"
                />
                <Input
                  label="禁用状态"
                  placeholder="禁用的输入框"
                  disabled
                />
              </div>
            </div>

            {/* Textarea */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Textarea 文本域
              </h4>
              <div className="space-y-3">
                <Textarea
                  label="描述"
                  placeholder="请输入详细描述..."
                  rows={4}
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                  helperText={`${textareaValue.length} / 500 字符`}
                />
                <Textarea
                  label="错误状态"
                  placeholder="请输入内容"
                  error="内容不能为空"
                  rows={3}
                />
              </div>
            </div>

            {/* Select */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Select 选择框
              </h4>
              <div className="space-y-3">
                <Select
                  label="选择类型"
                  value={selectValue}
                  onChange={setSelectValue}
                  options={selectOptions}
                  placeholder="请选择一个选项..."
                />
                <Select
                  label="错误状态"
                  value=""
                  onChange={() => {}}
                  options={selectOptions}
                  error="请选择一个选项"
                />
              </div>
            </div>

            {/* Checkbox */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Checkbox 复选框
              </h4>
              <div className="space-y-3">
                <Checkbox
                  label="同意服务条款"
                  description="我已阅读并同意服务条款和隐私政策"
                  checked={checkboxChecked}
                  onChange={(e) => setCheckboxChecked(e.target.checked)}
                />
                <Checkbox
                  label="接收通知"
                  checked={true}
                  onChange={() => {}}
                />
                <Checkbox
                  label="禁用状态"
                  checked={false}
                  disabled
                />
                <Checkbox
                  label="错误状态"
                  error="必须同意此项才能继续"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Components Section */}
      <Card variant="glass">
        <CardHeader
          title="反馈组件"
          description="徽章、提示框和模态框"
        />
        <CardContent>
          <div className="space-y-6">
            {/* Badge */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Badge 徽章
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">默认</Badge>
                <Badge variant="primary">主要</Badge>
                <Badge variant="success">成功</Badge>
                <Badge variant="warning">警告</Badge>
                <Badge variant="danger">危险</Badge>
                <Badge variant="info">信息</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="success" dot>
                  带圆点
                </Badge>
                <Badge variant="primary" size="sm">
                  小尺寸
                </Badge>
                <Badge variant="warning" size="lg">
                  大尺寸
                </Badge>
              </div>
            </div>

            {/* Tooltip */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Tooltip 提示框
              </h4>
              <div className="flex flex-wrap gap-4">
                <Tooltip content="顶部提示" position="top">
                  <Button variant="outline" size="sm">
                    顶部
                  </Button>
                </Tooltip>
                <Tooltip content="底部提示" position="bottom">
                  <Button variant="outline" size="sm">
                    底部
                  </Button>
                </Tooltip>
                <Tooltip content="左侧提示" position="left">
                  <Button variant="outline" size="sm">
                    左侧
                  </Button>
                </Tooltip>
                <Tooltip content="右侧提示" position="right">
                  <Button variant="outline" size="sm">
                    右侧
                  </Button>
                </Tooltip>
                <Tooltip content="这是一个带图标的提示信息">
                  <Button variant="ghost" size="sm" icon={<Info size={16} />}>
                    悬停查看
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Modal */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-notion-text-primary dark:text-white">
                Modal 模态框
              </h4>
              <Button onClick={() => setIsModalOpen(true)}>打开模态框</Button>
              <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="示例模态框"
                description="这是一个使用玻璃拟态效果的模态框"
                size="md"
              >
                <div className="space-y-4">
                  <p className="text-sm text-notion-text-secondary dark:text-gray-400">
                    模态框可以用于显示重要信息、确认操作或收集用户输入。
                  </p>
                  <Input label="用户名" placeholder="请输入用户名" />
                  <Textarea
                    label="备注"
                    placeholder="请输入备注信息..."
                    rows={3}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsModalOpen(false)}
                    >
                      取消
                    </Button>
                    <Button onClick={() => setIsModalOpen(false)}>确认</Button>
                  </div>
                </div>
              </Modal>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Components Section */}
      <div>
        <h2 className="mb-4 text-2xl font-bold text-notion-text-primary dark:text-white">
          Card 卡片组件
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Default Card */}
          <Card variant="default">
            <CardHeader title="默认卡片" description="使用默认样式的卡片" />
            <CardContent>
              <p className="text-sm">
                这是一个默认样式的卡片，带有白色背景和边框。
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm">
                取消
              </Button>
              <Button size="sm">确认</Button>
            </CardFooter>
          </Card>

          {/* Glass Card */}
          <Card variant="glass">
            <CardHeader title="玻璃拟态卡片" description="使用玻璃拟态效果" />
            <CardContent>
              <p className="text-sm">
                这是一个玻璃拟态风格的卡片，带有模糊背景效果。
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="ghost" size="sm" icon={<Trash2 size={16} />}>
                删除
              </Button>
              <Button size="sm" icon={<Save size={16} />}>
                保存
              </Button>
            </CardFooter>
          </Card>

          {/* Bordered Card */}
          <Card variant="bordered">
            <CardHeader title="边框卡片" description="使用边框样式" />
            <CardContent>
              <p className="text-sm">
                这是一个边框样式的卡片，背景透明，只有边框。
              </p>
            </CardContent>
            <CardFooter>
              <Badge variant="success">已完成</Badge>
            </CardFooter>
          </Card>

          {/* Hoverable Card */}
          <Card variant="glass" hoverable>
            <CardHeader
              title="可悬停卡片"
              description="鼠标悬停时有交互效果"
            />
            <CardContent>
              <p className="text-sm">
                将鼠标悬停在此卡片上，可以看到缩放和阴影效果。
              </p>
            </CardContent>
          </Card>

          {/* Card with different padding */}
          <Card variant="default" padding="lg">
            <CardHeader title="大间距卡片" description="使用更大的内边距" />
            <CardContent>
              <p className="text-sm">这个卡片使用了更大的内边距。</p>
            </CardContent>
          </Card>

          {/* Card with custom content */}
          <Card variant="glass" padding="sm">
            <CardHeader title="小间距卡片" />
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">进度</span>
                  <Badge variant="primary">75%</Badge>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-notion-bg-secondary dark:bg-gray-700">
                  <div className="h-full w-3/4 bg-notion-accent transition-all duration-300" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Button Variants Section */}
      <Card variant="glass">
        <CardHeader
          title="Button 按钮变体"
          description="所有按钮样式和尺寸"
        />
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-notion-text-primary dark:text-white">
                按钮变体
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-notion-text-primary dark:text-white">
                按钮尺寸
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-notion-text-primary dark:text-white">
                带图标的按钮
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button icon={<Save size={16} />}>保存</Button>
                <Button variant="outline" icon={<Trash2 size={16} />}>
                  删除
                </Button>
                <Button variant="ghost" icon={<Info size={16} />}>
                  信息
                </Button>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-notion-text-primary dark:text-white">
                加载状态
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button loading>加载中...</Button>
                <Button variant="outline" loading>
                  处理中
                </Button>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-notion-text-primary dark:text-white">
                禁用状态
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button disabled>禁用按钮</Button>
                <Button variant="outline" disabled>
                  禁用按钮
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Notes */}
      <Card variant="bordered">
        <CardHeader
          title="性能优化说明"
          description="组件遵循 Vercel React 最佳实践"
        />
        <CardContent>
          <ul className="space-y-2 text-sm text-notion-text-secondary dark:text-gray-400">
            <li>✓ 所有组件使用 React.forwardRef 支持 ref 转发</li>
            <li>✓ 使用 cn() 工具函数优化类名合并</li>
            <li>✓ 表单组件支持完整的无障碍属性（aria-*）</li>
            <li>✓ 动画使用 CSS transitions 而非 JavaScript</li>
            <li>✓ 组件支持受控和非受控模式</li>
            <li>✓ 所有交互元素支持键盘导航</li>
            <li>✓ 使用 Headless UI 确保无障碍性</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
