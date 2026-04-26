import React, { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useOnboardingStore } from '../store/onboardingStore'
import { useAppStore } from '../store/appStore'
import { StepIndicator } from '../components/onboarding/StepIndicator'
import { WelcomeStep } from '../components/onboarding/WelcomeStep'
import { DataSourceStep } from '../components/onboarding/DataSourceStep'
import { ImportProgressStep } from '../components/onboarding/ImportProgressStep'
import { ConnectToolsStep } from '../components/onboarding/ConnectToolsStep'
import { FirstChatStep } from '../components/onboarding/FirstChatStep'
import { CompletionStep } from '../components/onboarding/CompletionStep'

export function OnboardingPage() {
  const currentStep = useOnboardingStore((s) => s.currentStep)
  const onboardingCompleted = useOnboardingStore((s) => s.onboardingCompleted)
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted)

  useEffect(() => {
    if (onboardingCompleted) {
      setOnboardingCompleted(true)
    }
  }, [onboardingCompleted, setOnboardingCompleted])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <StepIndicator currentStep={currentStep} totalSteps={6} />

        <AnimatePresence mode="wait">
          {currentStep === 1 && <WelcomeStep key="welcome" />}
          {currentStep === 2 && <DataSourceStep key="datasource" />}
          {currentStep === 3 && <ImportProgressStep key="import" />}
          {currentStep === 4 && <ConnectToolsStep key="connect" />}
          {currentStep === 5 && <FirstChatStep key="chat" />}
          {currentStep === 6 && <CompletionStep key="complete" />}
        </AnimatePresence>
      </div>
    </div>
  )
}
