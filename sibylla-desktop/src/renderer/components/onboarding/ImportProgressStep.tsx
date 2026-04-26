import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'
import type { ImportResult } from '../../../shared/types'

type ImportPhase = 'scanning' | 'importing' | 'complete' | 'error'

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`
  const minutes = Math.floor(seconds / 60)
  const secs = Math.ceil(seconds % 60)
  if (minutes < 60) return `${minutes} 分 ${secs} 秒`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours} 小时 ${mins} 分`
}

export function ImportProgressStep() {
  const selectedDataSources = useOnboardingStore((s) => s.selectedDataSources)
  const setImportResult = useOnboardingStore((s) => s.setImportResult)
  const nextStep = useOnboardingStore((s) => s.nextStep)

  const [phase, setPhase] = useState<ImportPhase>('scanning')
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentFile, setCurrentFile] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eta, setEta] = useState<string | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    async function startImport() {
      try {
        setPhase('scanning')

        let totalFiles = 0
        for (const source of selectedDataSources) {
          const planResponse =
            await window.electronAPI.importPipeline.plan(source)
          if (!planResponse.success) {
            throw new Error(planResponse.error?.message || 'Plan failed')
          }
          totalFiles += (planResponse.data as { totalFiles?: number } | undefined)?.totalFiles || 0
        }
        setTotal(totalFiles)

        setPhase('importing')
        startTimeRef.current = Date.now()

        const unsubProgress = window.electronAPI.importPipeline.onProgress(
          (data: Record<string, unknown>) => {
            const c = Number(data.current) || 0
            const t = Number(data.total) || totalFiles
            setCurrent(c)
            setTotal(t)
            setCurrentFile(String(data.currentFile || ''))

            if (c > 0 && startTimeRef.current > 0) {
              const elapsedSec = (Date.now() - startTimeRef.current) / 1000
              const rate = c / elapsedSec
              const remaining = (t - c) / rate
              setEta(formatETA(remaining))
            }
          }
        )

        let combinedResult: ImportResult | null = null

        for (const source of selectedDataSources) {
          const executeResponse =
            await window.electronAPI.importPipeline.execute(source, {})

          if (!executeResponse.success) {
            throw new Error(executeResponse.error?.message || 'Import failed')
          }

          const importData = executeResponse.data as ImportResult

          if (!combinedResult) {
            combinedResult = importData
          } else {
            combinedResult = {
              imported: [...combinedResult.imported, ...importData.imported],
              converted: [...combinedResult.converted, ...importData.converted],
              skipped: [...combinedResult.skipped, ...importData.skipped],
              failed: [...combinedResult.failed, ...importData.failed],
              durationMs: combinedResult.durationMs + importData.durationMs,
            }
          }
        }

        unsubProgress()

        if (combinedResult) {
          setResult(combinedResult)
          setImportResult(combinedResult)
        }
        setPhase('complete')

        setTimeout(() => nextStep(), 1000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setPhase('error')
      }
    }

    startImport()
  }, [selectedDataSources, setImportResult, nextStep])

  const successCount = result
    ? result.imported.length + result.converted.length
    : 0
  const errorCount = result ? result.failed.length : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="w-full max-w-2xl"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">
        正在导入你的文件
      </h2>

      {phase === 'scanning' && (
        <div className="flex items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">正在扫描文件结构...</p>
        </div>
      )}

      {phase === 'importing' && (
        <div>
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>正在导入 {total} 个文档...</span>
              <span>
                {current} / {total}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div
                className="bg-indigo-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{
                  width: total > 0 ? `${(current / total) * 100}%` : '0%',
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {eta && (
              <p className="mt-1 text-xs text-gray-500">
                预计剩余时间: {eta}
              </p>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500 truncate">
            当前: {currentFile}
          </p>
        </div>
      )}

      {phase === 'complete' && result && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            导入完成！
          </h3>
          <div className="text-gray-600 dark:text-gray-400">
            <p>已导入 {successCount} 个文件</p>
            {errorCount > 0 && (
              <p className="text-amber-600">跳过 {errorCount} 个错误文件</p>
            )}
          </div>
        </motion.div>
      )}

      {phase === 'error' && (
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            导入失败
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        </div>
      )}
    </motion.div>
  )
}
