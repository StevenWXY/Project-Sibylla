import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompletionStep } from '../../src/renderer/components/onboarding/CompletionStep'
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

describe('CompletionStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset()
  })

  it('renders the celebration title', () => {
    render(<CompletionStep />)
    expect(
      screen.getByText('🎉 Sibylla 已经了解你了！')
    ).toBeInTheDocument()
  })

  it('renders the next step cards', () => {
    render(<CompletionStep />)
    expect(screen.getByText('写第一条笔记')).toBeInTheDocument()
    expect(screen.getByText('创建第一个任务')).toBeInTheDocument()
    expect(screen.getByText('探索更多工具')).toBeInTheDocument()
  })

  it('renders the enter workspace button', () => {
    render(<CompletionStep />)
    expect(screen.getByText('进入工作区')).toBeInTheDocument()
  })

  it('clicking enter workspace calls completeOnboarding', () => {
    const mockReload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    })

    render(<CompletionStep />)
    fireEvent.click(screen.getByText('进入工作区'))

    expect(useOnboardingStore.getState().onboardingCompleted).toBe(true)
  })
})
