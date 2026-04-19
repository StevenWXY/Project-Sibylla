/**
 * ModeSelector component tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeSelector } from '../../src/renderer/components/studio/harness/ModeSelector'
import { useHarnessStore } from '../../src/renderer/store/harnessStore'

describe('ModeSelector', () => {
  beforeEach(() => {
    useHarnessStore.getState().reset()
  })

  it('highlights current mode (dual by default)', () => {
    render(<ModeSelector />)

    const dualButton = screen.getByText('Dual')
    expect(dualButton.className).toContain('bg-indigo-500')

    const singleButton = screen.getByText('Single')
    expect(singleButton.className).not.toContain('bg-indigo-500')
  })

  it('switches mode on click and calls setMode', () => {
    render(<ModeSelector />)

    const panelButton = screen.getByText('Panel')
    fireEvent.click(panelButton)

    expect(useHarnessStore.getState().currentMode).toBe('panel')
  })

  it('shows correct tooltip content', () => {
    render(<ModeSelector />)

    const singleButton = screen.getByText('Single')
    expect(singleButton.getAttribute('title')).toBe('直接回答，不进行质量审查')

    const dualButton = screen.getByText('Dual')
    expect(dualButton.getAttribute('title')).toBe('AI 自检后再回答（推荐）')
  })
})
