/**
 * @vitest-environment jsdom
 *
 * Interactive jsdom tests for the LoopCreateDialog and LoopsManager.
 * Tests that the form opens, typed values reach provider.createLoop-equivalent,
 * the created loop appears with next-run, and cancel calls provider.cancelLoop
 * and updates state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() }
}))

import { LoopCreateDialog, type LoopCreateDraft } from './LoopCreateDialog'
import { LoopsManager } from './LoopsManager'
import type { LoopRecord } from '../../../../kun/src/contracts/automations.js'

describe('LoopCreateDialog (jsdom interactive)', () => {
  afterEach(() => {
    cleanup()
  })

  it('form opens when rendered (dialog role present)', () => {
    render(
      React.createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'proj', threadTemplateId: 'tpl-1', model: 'deepseek-v4-pro' },
        onClose: vi.fn(),
        onSubmit: vi.fn()
      })
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('loopDialogTitle')).toBeInTheDocument()
  })

  it('typed values are passed to onSubmit when form is filled and submitted', async () => {
    const onSubmit = vi.fn()
    render(
      React.createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'default', threadTemplateId: 'tpl-1', model: 'deepseek-v4-pro' },
        onClose: vi.fn(),
        onSubmit
      })
    )

    // Fill prompt
    const promptArea = screen.getByPlaceholderText('loopDialogPromptPlaceholder')
    fireEvent.change(promptArea, { target: { value: 'Review PRs every hour' } })

    // Change model to 'auto'
    const modelSelect = screen.getByDisplayValue('deepseek-v4-pro')
    fireEvent.change(modelSelect, { target: { value: 'auto' } })

    // Set every minutes to 30
    const everyInput = screen.getByDisplayValue('60')
    fireEvent.change(everyInput, { target: { value: '30' } })

    // Set max runs to 50 (first "Unlimited" input)
    const maxRunsInputs = screen.getAllByPlaceholderText('loopDialogUnlimited')
    fireEvent.change(maxRunsInputs[0], { target: { value: '50' } })

    // Submit
    const confirmBtn = screen.getByText('confirm')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    const submittedDraft: LoopCreateDraft = onSubmit.mock.calls[0][0]
    expect(submittedDraft.prompt).toBe('Review PRs every hour')
    expect(submittedDraft.model).toBe('auto')
    expect(submittedDraft.everyMinutes).toBe(30)
    expect(submittedDraft.maxRuns).toBe(50)
    expect(submittedDraft.scheduleKind).toBe('interval')
  })

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn()
    render(
      React.createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'default', threadTemplateId: 'tpl-1' },
        onClose,
        onSubmit: vi.fn()
      })
    )

    const cancelBtn = screen.getByText('cancel')
    fireEvent.click(cancelBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows validation error for empty prompt and does not call onSubmit', async () => {
    const onSubmit = vi.fn()
    render(
      React.createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'default', threadTemplateId: '', model: 'deepseek-v4-pro' },
        onClose: vi.fn(),
        onSubmit
      })
    )

    const confirmBtn = screen.getByText('confirm')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText('loopDialogErrorPromptRequired')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('created loop with next-run is shown after dialog submit (simulated)', async () => {
    // Simulate the Workbench.tsx pattern: onSubmit called → setLoops appends result.loop
    const onSubmit = vi.fn()
    const { rerender } = render(
      React.createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'default', threadTemplateId: 'tpl-1' },
        onClose: vi.fn(),
        onSubmit
      })
    )

    // Fill prompt and submit
    fireEvent.change(screen.getByPlaceholderText('loopDialogPromptPlaceholder'), {
      target: { value: 'Daily summary' }
    })
    fireEvent.click(screen.getByText('confirm'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    // Simulate that the parent (Workbench) received the draft, called provider.createLoop,
    // and got back a loop record with nextRunAt set.
    const createdLoop: LoopRecord = {
      id: 'new-loop-1',
      projectId: 'default',
      threadTemplateId: 'tpl-1',
      prompt: 'Daily summary',
      model: 'deepseek-v4-pro',
      schedule: { kind: 'interval', everyMinutes: 60 },
      status: 'active',
      catchUpPolicy: 'skip',
      queuePolicy: 'queue',
      runCount: 0,
      nextRunAt: '2026-06-12T15:00:00.000Z',
      lastRunStatus: 'idle',
      usage: { totalTurns: 0, totalTokens: 0, totalCostUsd: 0, lastTurnTokens: 0, lastTurnCostUsd: 0 },
      createdAt: '2026-06-12T14:00:00.000Z',
      updatedAt: '2026-06-12T14:00:00.000Z'
    }

    // Render the LoopsManager with the newly created loop
    cleanup()
    render(
      React.createElement(LoopsManager, {
        loops: [createdLoop],
        onCreate: vi.fn()
      })
    )

    // The loop should appear with its prompt
    expect(screen.getByText('Daily summary')).toBeInTheDocument()
    // The status badge should be 'Active'
    expect(screen.getByText('loopStatusActive')).toBeInTheDocument()
    // Next run should be visible when expanded
    fireEvent.click(screen.getByText('Daily summary'))
    await waitFor(() => {
      expect(screen.getByText('loopsNextRun')).toBeInTheDocument()
    })
  })
})

describe('LoopsManager cancel flow (jsdom interactive)', () => {
  afterEach(() => {
    cleanup()
  })

  it('cancel calls onCancel with id and updates visible state', async () => {
    const onCancel = vi.fn()
    const activeLoop: LoopRecord = {
      id: 'loop-cancel-test',
      projectId: 'default',
      threadTemplateId: 'thread-tpl-1',
      prompt: 'Review open PRs',
      model: 'deepseek-v4-pro',
      schedule: { kind: 'interval', everyMinutes: 60 },
      status: 'active',
      catchUpPolicy: 'skip',
      queuePolicy: 'queue',
      runCount: 12,
      nextRunAt: '2026-06-12T14:00:00.000Z',
      lastRunAt: '2026-06-12T13:00:00.000Z',
      lastRunStatus: 'success',
      usage: { totalTurns: 36, totalTokens: 48000, totalCostUsd: 0.024, lastTurnTokens: 4000, lastTurnCostUsd: 0.002 },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-12T13:05:00.000Z'
    }

    const { rerender } = render(
      React.createElement(LoopsManager, {
        loops: [activeLoop],
        onCancel,
        onPause: vi.fn(),
        onResume: vi.fn(),
        onDelete: vi.fn()
      })
    )

    // Expand the loop card
    fireEvent.click(screen.getByText('Review open PRs'))

    // Cancel button should be visible
    await waitFor(() => {
      expect(screen.getByText('loopsCancel')).toBeInTheDocument()
    })

    // Click cancel
    fireEvent.click(screen.getByText('loopsCancel'))

    // Verify onCancel was called with the correct id
    expect(onCancel).toHaveBeenCalledWith('loop-cancel-test')

    // Now simulate the parent updating state (Workbench.tsx handleLoopCancel pattern):
    // setLoops(prev => prev.map(l => l.id === id ? { ...l, status: 'cancelled' } : l))
    const cancelledLoop: LoopRecord = { ...activeLoop, status: 'cancelled' as const }

    // Re-render with updated state
    cleanup()
    render(
      React.createElement(LoopsManager, {
        loops: [cancelledLoop],
        onResume: vi.fn(),
        onDelete: vi.fn()
      })
    )

    // The status badge should now show 'Cancelled'
    expect(screen.getByText('loopStatusCancelled')).toBeInTheDocument()

    // Expand again to verify cancel button is gone (only Reactivate for cancelled)
    fireEvent.click(screen.getByText('Review open PRs'))
    await waitFor(() => {
      expect(screen.getByText('loopsReactivate')).toBeInTheDocument()
    })
    // Cancel button should not be present
    expect(screen.queryByText('loopsCancel')).not.toBeInTheDocument()
  })
})
