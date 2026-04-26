import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useOnboardingStore,
  detectUserType,
} from '../../src/renderer/store/onboardingStore'

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset()
  })

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useOnboardingStore.getState()
      expect(state.currentStep).toBe(1)
      expect(state.onboardingCompleted).toBe(false)
      expect(state.selectedDataSources).toEqual([])
      expect(state.connectedTools).toEqual([])
      expect(state.importResult).toBeNull()
      expect(state.firstChatCompleted).toBe(false)
      expect(state.userType).toBe('default')
    })
  })

  describe('step navigation', () => {
    it('advances to next step', () => {
      useOnboardingStore.getState().nextStep()
      expect(useOnboardingStore.getState().currentStep).toBe(2)
    })

    it('goes back to previous step', () => {
      useOnboardingStore.getState().nextStep()
      useOnboardingStore.getState().prevStep()
      expect(useOnboardingStore.getState().currentStep).toBe(1)
    })

    it('does not go below step 1', () => {
      useOnboardingStore.getState().prevStep()
      expect(useOnboardingStore.getState().currentStep).toBe(1)
    })

    it('does not go above step 6', () => {
      useOnboardingStore.getState().skipTo(6)
      useOnboardingStore.getState().nextStep()
      expect(useOnboardingStore.getState().currentStep).toBe(6)
    })

    it('jumps to specific step', () => {
      useOnboardingStore.getState().skipTo(5)
      expect(useOnboardingStore.getState().currentStep).toBe(5)
    })

    it('clamps skipTo to valid range', () => {
      useOnboardingStore.getState().skipTo(0)
      expect(useOnboardingStore.getState().currentStep).toBe(1)
      useOnboardingStore.getState().skipTo(10)
      expect(useOnboardingStore.getState().currentStep).toBe(6)
    })
  })

  describe('data source selection', () => {
    it('sets selected data sources', () => {
      useOnboardingStore.getState().setSelectedDataSources(['notion', 'obsidian'])
      expect(useOnboardingStore.getState().selectedDataSources).toEqual([
        'notion',
        'obsidian',
      ])
    })
  })

  describe('connected tools', () => {
    it('sets connected tools', () => {
      useOnboardingStore.getState().setConnectedTools(['github'])
      expect(useOnboardingStore.getState().connectedTools).toEqual(['github'])
    })
  })

  describe('first chat', () => {
    it('marks first chat completed', () => {
      useOnboardingStore.getState().setFirstChatCompleted()
      expect(useOnboardingStore.getState().firstChatCompleted).toBe(true)
    })
  })

  describe('user type', () => {
    it('sets user type', () => {
      useOnboardingStore.getState().setUserType('student')
      expect(useOnboardingStore.getState().userType).toBe('student')
    })
  })

  describe('completeOnboarding', () => {
    it('marks onboarding completed', async () => {
      await useOnboardingStore.getState().completeOnboarding()
      expect(useOnboardingStore.getState().onboardingCompleted).toBe(true)
    })
  })

  describe('reset', () => {
    it('resets to initial state', () => {
      useOnboardingStore.getState().nextStep()
      useOnboardingStore.getState().setSelectedDataSources(['notion'])
      useOnboardingStore.getState().setFirstChatCompleted()
      useOnboardingStore.getState().reset()

      const state = useOnboardingStore.getState()
      expect(state.currentStep).toBe(1)
      expect(state.selectedDataSources).toEqual([])
      expect(state.firstChatCompleted).toBe(false)
      expect(state.onboardingCompleted).toBe(false)
    })
  })
})

describe('detectUserType', () => {
  it('detects student from .edu email', () => {
    expect(detectUserType({ email: 'alice@stanford.edu' })).toBe('student')
  })

  it('detects crypto from web3 login', () => {
    expect(detectUserType({ loginMethod: 'web3' })).toBe('crypto')
  })

  it('defaults to default for regular email', () => {
    expect(detectUserType({ email: 'alice@example.com' })).toBe('default')
  })

  it('defaults to default for undefined fields', () => {
    expect(detectUserType({})).toBe('default')
  })

  it('prioritizes .edu over web3', () => {
    expect(
      detectUserType({ email: 'user@mit.edu', loginMethod: 'web3' })
    ).toBe('student')
  })
})
