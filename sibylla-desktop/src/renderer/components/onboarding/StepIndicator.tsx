import React from 'react'
import { motion } from 'framer-motion'

interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
        const isActive = step === currentStep
        const isCompleted = step < currentStep

        return (
          <div key={step} className="flex items-center">
            <motion.div
              className={`
                flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium
                transition-colors duration-300 cursor-default select-none
                ${isActive ? 'bg-indigo-500 text-white ring-4 ring-indigo-100 dark:ring-indigo-900/40' : ''}
                ${isCompleted ? 'bg-emerald-500 text-white' : ''}
                ${!isActive && !isCompleted ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : ''}
              `}
              animate={isActive ? { scale: [1, 1.08, 1] } : {}}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
            >
              {isCompleted ? '✓' : step}
            </motion.div>

            {step < totalSteps && (
              <div
                className={`
                  w-12 h-1 mx-1 rounded-full transition-colors duration-300
                  ${step < currentStep ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
