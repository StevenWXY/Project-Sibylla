import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { ImportResult } from '../../shared/types'

/**
 * User type for differentiated onboarding experiences
 */
export type UserType = 'student' | 'crypto' | 'startup' | 'default'

/**
 * Onboarding state interface
 */
interface OnboardingState {
  // ========== State ==========
  /** Current step number (1-6) */
  currentStep: number
  /** Selected data sources for import */
  selectedDataSources: string[]
  /** Connected external tools */
  connectedTools: string[]
  /** Import result from TASK040 pipeline */
  importResult: ImportResult | null
  /** Whether the first AI chat has been completed */
  firstChatCompleted: boolean
  /** Whether onboarding is fully completed */
  onboardingCompleted: boolean
  /** Detected user type for differentiated experience */
  userType: UserType
}

/**
 * Onboarding actions interface
 */
interface OnboardingActions {
  /** Advance to the next step (max 6) */
  nextStep: () => void
  /** Go back to the previous step (min 1) */
  prevStep: () => void
  /** Jump to a specific step */
  skipTo: (step: number) => void
  /** Set selected data sources */
  setSelectedDataSources: (sources: string[]) => void
  /** Set connected tools */
  setConnectedTools: (tools: string[]) => void
  /** Store import result */
  setImportResult: (result: ImportResult) => void
  /** Mark first chat as completed */
  setFirstChatCompleted: () => void
  /** Complete onboarding and persist to config.json */
  completeOnboarding: () => Promise<void>
  /** Set user type for differentiated experience */
  setUserType: (type: UserType) => void
  /** Reset store to initial state */
  reset: () => void
}

/**
 * Combined store type
 */
type OnboardingStore = OnboardingState & OnboardingActions

/**
 * Initial state (separated for reset functionality)
 */
const initialState: OnboardingState = {
  currentStep: 1,
  selectedDataSources: [],
  connectedTools: [],
  importResult: null,
  firstChatCompleted: false,
  onboardingCompleted: false,
  userType: 'default',
}

/**
 * Onboarding store with Zustand
 *
 * Features:
 * - DevTools integration for debugging
 * - Persist middleware for localStorage (dual persistence with config.json)
 * - 6-step wizard navigation
 * - Differentiated user type detection
 *
 * Persistence strategy:
 * - localStorage via Zustand persist (automatic)
 * - .sibylla/config.json via IPC (explicit in completeOnboarding)
 */
export const useOnboardingStore = create<OnboardingStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        nextStep: () =>
          set(
            (state) => ({
              currentStep: Math.min(state.currentStep + 1, 6),
            }),
            false,
            'onboarding/nextStep'
          ),

        prevStep: () =>
          set(
            (state) => ({
              currentStep: Math.max(state.currentStep - 1, 1),
            }),
            false,
            'onboarding/prevStep'
          ),

        skipTo: (step: number) =>
          set(
            { currentStep: Math.max(1, Math.min(step, 6)) },
            false,
            'onboarding/skipTo'
          ),

        setSelectedDataSources: (sources: string[]) =>
          set(
            { selectedDataSources: sources },
            false,
            'onboarding/setSelectedDataSources'
          ),

        setConnectedTools: (tools: string[]) =>
          set(
            { connectedTools: tools },
            false,
            'onboarding/setConnectedTools'
          ),

        setImportResult: (result: ImportResult) =>
          set(
            { importResult: result },
            false,
            'onboarding/setImportResult'
          ),

        setFirstChatCompleted: () =>
          set(
            { firstChatCompleted: true },
            false,
            'onboarding/setFirstChatCompleted'
          ),

        completeOnboarding: async () => {
          set(
            { onboardingCompleted: true },
            false,
            'onboarding/completeOnboarding'
          )
          // Sync to main process for dual persistence
          try {
            await window.electronAPI.app.updateConfig({
              onboardingCompleted: true,
            })
          } catch (error) {
            console.error('Failed to persist onboarding completion:', error)
          }
        },

        setUserType: (type: UserType) =>
          set(
            { userType: type },
            false,
            'onboarding/setUserType'
          ),

        reset: () => set(initialState, false, 'onboarding/reset'),
      }),
      {
        name: 'sibylla-onboarding',
        partialize: (state) => ({
          currentStep: state.currentStep,
          selectedDataSources: state.selectedDataSources,
          connectedTools: state.connectedTools,
          onboardingCompleted: state.onboardingCompleted,
          userType: state.userType,
        }),
      }
    ),
    { name: 'OnboardingStore' }
  )
)

/**
 * Detect user type from user profile information
 *
 * Priority:
 * 1. .edu email → student
 * 2. Web3 login method → crypto
 * 3. Default → default (startup detection requires workspace content analysis)
 */
export function detectUserType(user: {
  email?: string
  loginMethod?: string
}): UserType {
  if (user.email?.endsWith('.edu')) return 'student'
  if (user.loginMethod === 'web3') return 'crypto'
  return 'default'
}

/**
 * Selectors for optimized re-renders
 */
export const selectCurrentStep = (state: OnboardingStore) => state.currentStep
export const selectOnboardingCompleted = (state: OnboardingStore) => state.onboardingCompleted
export const selectUserType = (state: OnboardingStore) => state.userType
