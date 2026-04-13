import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { FolderOpen, AlertCircle, CheckCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { WorkspaceInfo } from '../../../shared/types'

interface OpenWorkspaceDialogProps {
  onClose: () => void
  onSuccess?: (workspace: WorkspaceInfo) => void
}

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

export function OpenWorkspaceDialog({ onClose, onSuccess }: OpenWorkspaceDialogProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [path, setPath] = useState('')
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Get store action to update current workspace
  const setCurrentWorkspace = useAppStore((state) => state.setCurrentWorkspace)

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI.workspace.selectFolder()
      if (result.success && result.data) {
        setPath(result.data)
        // Auto-validate after selection
        await validateWorkspace(result.data)
      } else if (result.error) {
        setError(result.error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择文件夹失败')
    }
  }

  // Validate workspace
  const validateWorkspace = async (workspacePath: string) => {
    if (!workspacePath.trim()) {
      setValidationStatus('idle')
      setValidationError(null)
      return
    }

    setValidationStatus('validating')
    setValidationError(null)

    try {
      const result = await window.electronAPI.workspace.validate(workspacePath)
      
      if (result.success) {
        if (result.data) {
          setValidationStatus('valid')
          setValidationError(null)
        } else {
          setValidationStatus('invalid')
          setValidationError('所选目录不是有效的 Workspace')
        }
      } else if (result.error) {
        setValidationStatus('invalid')
        setValidationError(result.error.message)
      }
    } catch (err) {
      setValidationStatus('invalid')
      setValidationError(err instanceof Error ? err.message : '验证失败')
    }
  }

  // Handle path change
  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = e.target.value
    setPath(newPath)
    
    // Debounce validation
    if (validationStatus !== 'idle') {
      setValidationStatus('idle')
      setValidationError(null)
    }
  }

  // Handle path blur (validate on blur)
  const handlePathBlur = () => {
    if (path.trim()) {
      validateWorkspace(path)
    }
  }

  // Handle open workspace
  const handleOpen = async () => {
    if (!path.trim()) {
      setError('请选择 Workspace 位置')
      return
    }

    if (validationStatus !== 'valid') {
      await validateWorkspace(path)
      // Wait for validation to complete
      return
    }

    setIsOpening(true)
    setError(null)

    try {
      const result = await window.electronAPI.workspace.open(path)
      
      if (result.success && result.data) {
        // Update global state with the opened workspace
        setCurrentWorkspace(result.data)
        
        // Call success callback with full workspace info
        onSuccess?.(result.data)
        handleClose()
      } else if (result.error) {
        setError(result.error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开 Workspace 失败')
    } finally {
      setIsOpening(false)
    }
  }

  // Handle close
  const handleClose = () => {
    if (!isOpening) {
      setIsOpen(false)
      setPath('')
      setValidationStatus('idle')
      setValidationError(null)
      setError(null)
      onClose()
    }
  }

  // Get validation icon and color
  const getValidationIndicator = () => {
    switch (validationStatus) {
      case 'validating':
        return (
          <div className="flex items-center gap-2 text-sm text-sys-darkMuted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>验证中...</span>
          </div>
        )
      case 'valid':
        return (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <span>有效的 Workspace</span>
          </div>
        )
      case 'invalid':
        return (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>{validationError || '无效的 Workspace'}</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="打开 Workspace"
      description="选择一个现有的 Workspace 目录"
      size="md"
      showCloseButton={!isOpening}
    >
      <div className="space-y-6">
        {/* Path Selection */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white">
            Workspace 位置
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="选择 Workspace 文件夹"
              value={path}
              onChange={handlePathChange}
              onBlur={handlePathBlur}
              disabled={isOpening}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleSelectFolder}
              disabled={isOpening}
              icon={<FolderOpen className="h-4 w-4" />}
            >
              浏览
            </Button>
          </div>
        </div>

        {/* Validation Status */}
        {validationStatus !== 'idle' && (
          <div className="rounded-lg border border-sys-darkBorder bg-sys-darkSurface p-3">
            {getValidationIndicator()}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Help Text */}
        <div className="rounded-lg border border-sys-darkBorder bg-sys-darkSurface p-3">
          <p className="text-sm text-sys-darkMuted">
            💡 提示：有效的 Workspace 目录应包含 <code className="rounded border border-white/10 bg-sys-black px-1 py-0.5">.sibylla</code> 配置文件夹
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isOpening}
          >
            取消
          </Button>
          
          <Button
            variant="primary"
            onClick={handleOpen}
            disabled={isOpening || validationStatus !== 'valid'}
            loading={isOpening}
          >
            打开
          </Button>
        </div>
      </div>
    </Modal>
  )
}
