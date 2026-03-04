import React, { useState, useEffect } from 'react'
import type { SystemInfo } from '../shared/types'

export default function App() {
  const [ipcStatus, setIpcStatus] = useState<string>('Not tested')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [echoResult, setEchoResult] = useState<string>('')
  const [echoInput, setEchoInput] = useState<string>('Hello from renderer!')

  // Load system information on mount
  useEffect(() => {
    const loadSystemInfo = async () => {
      try {
        const response = await window.electronAPI.getSystemInfo()
        if (response.success && response.data) {
          setSystemInfo(response.data)
          console.log('[Renderer] System info loaded:', response.data)
        }
      } catch (error) {
        console.error('[Renderer] Failed to load system info:', error)
      }
    }
    
    loadSystemInfo()
  }, [])

  // Test IPC communication with main process
  const handleTestIPC = async () => {
    setIsLoading(true)
    setIpcStatus('Testing...')
    
    try {
      const response = await window.electronAPI.ping()
      if (response.success && response.data) {
        setIpcStatus(`Success: ${response.data}`)
        console.log('[Renderer] IPC test successful:', response)
      } else {
        setIpcStatus(`Error: ${response.error?.message || 'Unknown error'}`)
      }
    } catch (error) {
      setIpcStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('[Renderer] IPC test failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Test echo with delay
  const handleEchoTest = async () => {
    setIsLoading(true)
    setEchoResult('Testing...')
    
    try {
      const response = await window.electronAPI.echo(echoInput, 500)
      if (response.success && response.data) {
        setEchoResult(response.data)
        console.log('[Renderer] Echo test successful:', response)
      } else {
        setEchoResult(`Error: ${response.error?.message || 'Unknown error'}`)
      }
    } catch (error) {
      setEchoResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('[Renderer] Echo test failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center max-w-3xl px-8 w-full">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Sibylla</h1>
        <p className="text-gray-600 mb-2">Phase 0 - Electron 脚手架搭建</p>
        <p className="text-sm text-gray-500 mb-8">
          基于 Electron 28 + React 18 + TypeScript 5 + Vite 5
        </p>
        
        {/* IPC Test Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">IPC 通信测试</h2>
          <div className="space-y-4">
            {/* Ping Test */}
            <div>
              <button
                onClick={handleTestIPC}
                disabled={isLoading}
                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                  isLoading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isLoading ? '测试中...' : '测试 Ping/Pong'}
              </button>
              <p className="mt-2 text-sm text-gray-600">
                状态: <span className="font-mono font-semibold">{ipcStatus}</span>
              </p>
            </div>

            {/* Echo Test */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={echoInput}
                  onChange={(e) => setEchoInput(e.target.value)}
                  placeholder="输入要回显的消息"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  onClick={handleEchoTest}
                  disabled={isLoading || !echoInput.trim()}
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    isLoading || !echoInput.trim()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  测试 Echo
                </button>
              </div>
              {echoResult && (
                <p className="text-sm text-gray-600">
                  结果: <span className="font-mono font-semibold">{echoResult}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* System Information */}
        {systemInfo && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">系统信息</h2>
            <div className="grid grid-cols-2 gap-3 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-gray-600">平台:</span>
                <span className="font-mono text-gray-900">{systemInfo.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">架构:</span>
                <span className="font-mono text-gray-900">{systemInfo.arch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">应用版本:</span>
                <span className="font-mono text-gray-900">{systemInfo.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Electron:</span>
                <span className="font-mono text-gray-900">{systemInfo.electronVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Chrome:</span>
                <span className="font-mono text-gray-900">{systemInfo.chromeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Node.js:</span>
                <span className="font-mono text-gray-900">{systemInfo.nodeVersion}</span>
              </div>
            </div>
          </div>
        )}

        {/* Status Information */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">渲染进程状态</h2>
          <div className="text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">环境:</span>
              <span className="font-mono text-gray-900">
                {import.meta.env.MODE}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">浏览器平台:</span>
              <span className="font-mono text-gray-900">{navigator.platform}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">语言:</span>
              <span className="font-mono text-gray-900">{navigator.language}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
