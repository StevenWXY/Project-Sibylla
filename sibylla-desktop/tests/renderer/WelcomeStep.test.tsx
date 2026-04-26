import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeStep } from '../../src/renderer/components/onboarding/WelcomeStep'
import { useOnboardingStore } from '../../src/renderer/store/onboardingStore'

vi.mock('framer-motion', () => ({
  motion: {
    div: (props: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, props.children),
    h1: (props: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('h1', props, props.children),
    p: (props: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('p', props, props.children),
    button: (props: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('button', props, props.children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}))

describe('WelcomeStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset()
  })

  it('renders the welcome title', () => {
    render(<WelcomeStep />)
    expect(screen.getByText('欢迎使用 Sibylla')).toBeInTheDocument()
  })

  it('renders the 3-minute setup slogan', () => {
    render(<WelcomeStep />)
    expect(screen.getByText('让我们 3 分钟完成设置')).toBeInTheDocument()
  })

  it('renders three core feature cards', () => {
    render(<WelcomeStep />)
    expect(screen.getByText('本地优先')).toBeInTheDocument()
    expect(screen.getByText('全局理解')).toBeInTheDocument()
    expect(screen.getByText('外部连接')).toBeInTheDocument()
  })

  it('has a start setup button that calls nextStep', () => {
    render(<WelcomeStep />)
    const button = screen.getByText('开始设置')
    fireEvent.click(button)
    expect(useOnboardingStore.getState().currentStep).toBe(2)
  })

  it('has a skip button that calls completeOnboarding', () => {
    render(<WelcomeStep />)
    const button = screen.getByText('跳过设置')
    fireEvent.click(button)
    expect(useOnboardingStore.getState().onboardingCompleted).toBe(true)
  })
})
