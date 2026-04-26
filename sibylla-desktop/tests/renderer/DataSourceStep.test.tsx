import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataSourceStep } from '../../src/renderer/components/onboarding/DataSourceStep'
import { useOnboardingStore } from '../../src/renderer/store/onboardingStore'

vi.mock('framer-motion', () => ({
  motion: {
    div: (props: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, props.children),
    button: (props: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('button', props, props.children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}))

describe('DataSourceStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset()
  })

  it('renders the title', () => {
    render(<DataSourceStep />)
    expect(screen.getByText('选择要导入的数据源')).toBeInTheDocument()
  })

  it('renders all five data source options', () => {
    render(<DataSourceStep />)
    expect(screen.getByText('Notion 导出包')).toBeInTheDocument()
    expect(screen.getByText('Google Docs')).toBeInTheDocument()
    expect(screen.getByText('Obsidian Vault')).toBeInTheDocument()
    expect(screen.getByText('本地文件夹')).toBeInTheDocument()
    expect(screen.getByText('空白开始')).toBeInTheDocument()
  })

  it('disables next button when nothing is selected', () => {
    render(<DataSourceStep />)
    const nextButton = screen.getByText('下一步')
    expect(nextButton).toBeDisabled()
  })

  it('enables next button when a source is selected', () => {
    render(<DataSourceStep />)
    fireEvent.click(screen.getByText('Notion 导出包'))
    const nextButton = screen.getByText('下一步')
    expect(nextButton).not.toBeDisabled()
  })

  it('selecting "空白开始" jumps to step 5', () => {
    render(<DataSourceStep />)
    fireEvent.click(screen.getByText('空白开始'))
    expect(useOnboardingStore.getState().currentStep).toBe(5)
    expect(useOnboardingStore.getState().selectedDataSources).toEqual(['blank'])
  })

  it('skip button jumps to step 5', () => {
    render(<DataSourceStep />)
    fireEvent.click(screen.getByText('跳过'))
    expect(useOnboardingStore.getState().currentStep).toBe(5)
  })

  it('allows multi-select of data sources', () => {
    render(<DataSourceStep />)
    fireEvent.click(screen.getByText('Notion 导出包'))
    fireEvent.click(screen.getByText('Obsidian Vault'))
    fireEvent.click(screen.getByText('下一步'))
    expect(useOnboardingStore.getState().selectedDataSources).toContain('notion')
    expect(useOnboardingStore.getState().selectedDataSources).toContain('obsidian')
  })
})
