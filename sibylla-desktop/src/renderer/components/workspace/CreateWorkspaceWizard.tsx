import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Checkbox } from '../ui/Checkbox'
import { ChevronLeft, ChevronRight, FolderOpen, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { CreateWorkspaceOptions, WorkspaceInfo } from '../../../shared/types'

interface CreateWorkspaceWizardProps {
  onClose: () => void
  onSuccess?: (workspace: WorkspaceInfo) => void
}

interface FormData {
  // Step 1: Basic Info
  name: string
  description: string
  icon: string
  
  // Step 2: Owner Info
  ownerName: string
  ownerEmail: string
  
  // Step 3: Location & Settings
  path: string
  enableCloudSync: boolean
  defaultModel: string
  syncInterval: number
}

interface FormErrors {
  name?: string
  description?: string
  ownerName?: string
  ownerEmail?: string
  path?: string
}

const EMOJI_PRESETS = ['🧠', '📚', '💡', '🎯', '🚀', '⚡', '🌟', '🔥']

export function CreateWorkspaceWizard({ onClose, onSuccess }: CreateWorkspaceWizardProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Get store action to update current workspace
  const setCurrentWorkspace = useAppStore((state) => state.setCurrentWorkspace)
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    icon: '🧠',
    ownerName: '',
    ownerEmail: '',
    path: '',
    enableCloudSync: false,
    defaultModel: 'claude-3-opus',
    syncInterval: 30,
  })
  
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  // Update form field
  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  // Validate current step
  const validateStep = (step: number): boolean => {
    const errors: FormErrors = {}
    
    if (step === 1) {
      if (!formData.name.trim()) {
        errors.name = '请输入 Workspace 名称'
      } else if (formData.name.length < 2) {
        errors.name = '名称至少需要 2 个字符'
      }
      
      if (!formData.description.trim()) {
        errors.description = '请输入 Workspace 描述'
      }
    }
    
    if (step === 2) {
      if (!formData.ownerName.trim()) {
        errors.ownerName = '请输入所有者姓名'
      }
      
      if (!formData.ownerEmail.trim()) {
        errors.ownerEmail = '请输入邮箱地址'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) {
        errors.ownerEmail = '请输入有效的邮箱地址'
      }
    }
    
    if (step === 3) {
      if (!formData.path.trim()) {
        errors.path = '请选择 Workspace 位置'
      }
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle next step
  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 3) {
        setCurrentStep(currentStep + 1)
      } else {
        handleCreate()
      }
    }
  }

  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI.workspace.selectFolder()
      if (result.success && result.data) {
        updateField('path', result.data)
      } else if (result.error) {
        setError(result.error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择文件夹失败')
    }
  }

  // Handle workspace creation
  const handleCreate = async () => {
    if (!validateStep(3)) return
    
    setIsCreating(true)
    setError(null)
    
    try {
      // Combine parent directory with workspace name to create full path
      // Use simple string concatenation since path.join is not available in renderer
      const separator = formData.path.endsWith('/') || formData.path.endsWith('\\') ? '' : '/'
      const workspacePath = formData.path + separator + formData.name
      
      console.log('[CreateWorkspaceWizard] Creating workspace:', {
        parentPath: formData.path,
        workspaceName: formData.name,
        finalPath: workspacePath
      })
      
      const options: CreateWorkspaceOptions = {
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        path: workspacePath,
        owner: {
          name: formData.ownerName,
          email: formData.ownerEmail,
        },
        enableCloudSync: formData.enableCloudSync,
        defaultModel: formData.defaultModel,
        syncInterval: formData.syncInterval,
      }
      
      const result = await window.electronAPI.workspace.create(options)
      
      if (result.success && result.data) {
        // Update global state with the created workspace
        setCurrentWorkspace(result.data)
        
        // Call success callback with full workspace info
        onSuccess?.(result.data)
        handleClose()
      } else if (result.error) {
        setError(result.error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 Workspace 失败')
    } finally {
      setIsCreating(false)
    }
  }

  // Handle close
  const handleClose = () => {
    if (!isCreating) {
      setIsOpen(false)
      setCurrentStep(1)
      setFormData({
        name: '',
        description: '',
        icon: '🧠',
        ownerName: '',
        ownerEmail: '',
        path: '',
        enableCloudSync: false,
        defaultModel: 'claude-3-opus',
        syncInterval: 30,
      })
      setFormErrors({})
      setError(null)
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="创建新 Workspace"
      description={`步骤 ${currentStep}/3`}
      size="lg"
      showCloseButton={!isCreating}
    >
      <div className="space-y-6">
        {/* Progress Indicator */}
        <div className="flex items-center justify-between">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center flex-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  step === currentStep
                    ? 'bg-notion-accent text-white'
                    : step < currentStep
                    ? 'bg-green-500 text-white'
                    : 'bg-notion-bg-tertiary text-notion-text-secondary dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {step}
              </div>
              {step < 3 && (
                <div
                  className={`mx-2 h-0.5 flex-1 transition-colors ${
                    step < currentStep
                      ? 'bg-green-500'
                      : 'bg-notion-border-default dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-notion-text-primary dark:text-white">
                基本信息
              </h4>
              
              <Input
                label="Workspace 名称"
                placeholder="例如：团队知识库"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                error={formErrors.name}
                disabled={isCreating}
              />
              
              <Input
                label="描述"
                placeholder="简要描述这个 Workspace 的用途"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                error={formErrors.description}
                disabled={isCreating}
              />
              
              <div>
                <label className="mb-1.5 block text-sm font-medium text-notion-text-primary dark:text-white">
                  图标
                </label>
                <div className="flex gap-2">
                  {EMOJI_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => updateField('icon', emoji)}
                      className={`flex h-12 w-12 items-center justify-center rounded-lg text-2xl transition-all ${
                        formData.icon === emoji
                          ? 'bg-notion-accent text-white ring-2 ring-notion-accent ring-offset-2'
                          : 'bg-notion-bg-tertiary hover:bg-notion-border-light dark:bg-gray-700 dark:hover:bg-gray-600'
                      }`}
                      disabled={isCreating}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Owner Info */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-notion-text-primary dark:text-white">
                所有者信息
              </h4>
              
              <Input
                label="姓名"
                placeholder="请输入您的姓名"
                value={formData.ownerName}
                onChange={(e) => updateField('ownerName', e.target.value)}
                error={formErrors.ownerName}
                disabled={isCreating}
              />
              
              <Input
                label="邮箱"
                type="email"
                placeholder="your@email.com"
                value={formData.ownerEmail}
                onChange={(e) => updateField('ownerEmail', e.target.value)}
                error={formErrors.ownerEmail}
                disabled={isCreating}
              />
            </div>
          )}

          {/* Step 3: Location & Settings */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-notion-text-primary dark:text-white">
                位置和设置
              </h4>
              
              <div>
                <label className="mb-1.5 block text-sm font-medium text-notion-text-primary dark:text-white">
                  父目录位置
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="选择父目录位置"
                    value={formData.path}
                    onChange={(e) => updateField('path', e.target.value)}
                    error={formErrors.path}
                    disabled={isCreating}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleSelectFolder}
                    disabled={isCreating}
                    icon={<FolderOpen className="h-4 w-4" />}
                  >
                    选择
                  </Button>
                </div>
                {formData.path && formData.name && (
                  <p className="mt-2 text-sm text-notion-text-secondary dark:text-gray-400">
                    💡 Workspace 将创建在：
                    <code className="ml-1 rounded bg-notion-bg-tertiary px-1.5 py-0.5 dark:bg-gray-700">
                      {formData.path}/{formData.name}
                    </code>
                  </p>
                )}
              </div>
              
              <Checkbox
                label="启用云端同步"
                description="将 Workspace 同步到云端，支持多设备协作"
                checked={formData.enableCloudSync}
                onChange={(e) => updateField('enableCloudSync', e.target.checked)}
                disabled={isCreating}
              />
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between gap-3">
          <Button
            variant="ghost"
            onClick={currentStep === 1 ? handleClose : handlePrevious}
            disabled={isCreating}
            icon={currentStep > 1 ? <ChevronLeft className="h-4 w-4" /> : undefined}
          >
            {currentStep === 1 ? '取消' : '上一步'}
          </Button>
          
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={isCreating}
            loading={isCreating}
            icon={currentStep < 3 ? <ChevronRight className="h-4 w-4" /> : undefined}
          >
            {currentStep === 3 ? '创建' : '下一步'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
