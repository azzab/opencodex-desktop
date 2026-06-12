import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import {
  LoopCreateDialog,
  newLoopDraft,
  validateLoopDraft,
  draftToCreateRequest,
  type LoopCreateDraft
} from './LoopCreateDialog'

const t = (key: string): string => key

describe('LoopCreateDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders all form sections with required fields', () => {
    const html = renderToStaticMarkup(
      createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'test-project', threadTemplateId: 'thread-123', model: 'deepseek-v4-pro' },
        onClose: vi.fn(),
        onSubmit: vi.fn()
      })
    )

    // Title
    expect(html).toContain('Create scheduled loop')

    // Sections
    expect(html).toContain('Loop instruction')
    expect(html).toContain('Context')
    expect(html).toContain('Model')
    expect(html).toContain('Schedule')
    // Render uses HTML-escaped &amp;
    expect(html).toContain('Policies')
    expect(html).toContain('limits')

    // Field labels
    expect(html).toContain('Prompt')
    expect(html).toContain('Project ID')
    expect(html).toContain('Thread template ID')

    // Schedule kind buttons
    expect(html).toContain('Interval')
    expect(html).toContain('Cron')
    expect(html).toContain('One-time')

    // Policy buttons
    expect(html).toContain('Skip')
    expect(html).toContain('Burst')
    expect(html).toContain('Queue')

    // Limit fields
    expect(html).toContain('Max runs')
    expect(html).toContain('Expire after runs')
    expect(html).toContain('Expire at')

    // Action buttons
    expect(html).toContain('>Cancel<')
    expect(html).toContain('>Confirm<')
  })

  it('pre-fills defaults from draftDefaults', () => {
    const html = renderToStaticMarkup(
      createElement(LoopCreateDialog, {
        draftDefaults: { projectId: 'my-project', threadTemplateId: 'tpl-42', model: 'deepseek-v4-flash' },
        onClose: vi.fn(),
        onSubmit: vi.fn()
      })
    )

    // Default model shown in select
    expect(html).toContain('deepseek-v4-flash')
  })

  it('shows interval fields when schedule kind is interval (default)', () => {
    const html = renderToStaticMarkup(
      createElement(LoopCreateDialog, {
        onClose: vi.fn(),
        onSubmit: vi.fn()
      })
    )

    expect(html).toContain('Every (minutes)')
  })
})

describe('newLoopDraft', () => {
  it('returns sensible defaults', () => {
    const draft = newLoopDraft()
    expect(draft.projectId).toBe('default')
    expect(draft.threadTemplateId).toBe('')
    expect(draft.prompt).toBe('')
    expect(draft.model).toBe('deepseek-v4-pro')
    expect(draft.scheduleKind).toBe('interval')
    expect(draft.everyMinutes).toBe(60)
    expect(draft.catchUpPolicy).toBe('skip')
    expect(draft.queuePolicy).toBe('queue')
  })

  it('accepts override defaults', () => {
    const draft = newLoopDraft({
      projectId: 'custom',
      threadTemplateId: 'tpl-1',
      model: 'auto'
    })
    expect(draft.projectId).toBe('custom')
    expect(draft.threadTemplateId).toBe('tpl-1')
    expect(draft.model).toBe('auto')
  })
})

describe('validateLoopDraft', () => {
  it('rejects empty prompt', () => {
    const draft: LoopCreateDraft = { ...newLoopDraft({ threadTemplateId: 'tpl-1' }), prompt: '' }
    expect(validateLoopDraft(draft, t)).toBe('loopDialogErrorPromptRequired')
  })

  it('rejects empty projectId', () => {
    const draft: LoopCreateDraft = { ...newLoopDraft({ threadTemplateId: 'tpl-1' }), prompt: 'test', projectId: '  ' }
    expect(validateLoopDraft(draft, t)).toBe('loopDialogErrorProjectRequired')
  })

  it('rejects empty threadTemplateId', () => {
    const draft: LoopCreateDraft = { ...newLoopDraft(), prompt: 'test', threadTemplateId: '  ' }
    expect(validateLoopDraft(draft, t)).toBe('loopDialogErrorThreadRequired')
  })

  it('rejects invalid interval', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: 'test',
      scheduleKind: 'interval',
      everyMinutes: 0
    }
    expect(validateLoopDraft(draft, t)).toBe('loopDialogErrorIntervalInvalid')
  })

  it('rejects empty cron expression', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: 'test',
      scheduleKind: 'cron',
      cronExpression: ''
    }
    expect(validateLoopDraft(draft, t)).toBe('loopDialogErrorCronRequired')
  })

  it('rejects past at time', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: 'test',
      scheduleKind: 'at',
      atTime: '2020-01-01T00:00'
    }
    expect(validateLoopDraft(draft, t)).toBe('loopDialogErrorAtPast')
  })

  it('accepts valid interval draft', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: 'test prompt',
      scheduleKind: 'interval',
      everyMinutes: 30
    }
    expect(validateLoopDraft(draft, t)).toBeNull()
  })

  it('accepts valid cron draft', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: 'test prompt',
      scheduleKind: 'cron',
      cronExpression: '0 * * * *'
    }
    expect(validateLoopDraft(draft, t)).toBeNull()
  })

  it('accepts valid at draft with future time', () => {
    // Use 25 hours in the future to avoid timezone edge cases
    const future = new Date(Date.now() + 90_000_000)
    const atTime = future.toISOString().slice(0, 16)
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: 'test prompt',
      scheduleKind: 'at',
      atTime
    }
    expect(validateLoopDraft(draft, t)).toBeNull()
  })
})

describe('draftToCreateRequest', () => {
  it('converts interval draft to create request', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-1' }),
      prompt: '  hello world  ',
      projectId: '  proj1  ',
      model: 'auto',
      scheduleKind: 'interval',
      everyMinutes: 120,
      catchUpPolicy: 'burst',
      queuePolicy: 'skip',
      maxRuns: 42,
      expiryRuns: 100
    }

    const result = draftToCreateRequest(draft)
    expect(result.projectId).toBe('proj1')
    expect(result.threadTemplateId).toBe('tpl-1')
    expect(result.prompt).toBe('hello world')
    expect(result.model).toBe('auto')
    expect(result.schedule).toEqual({ kind: 'interval', everyMinutes: 120 })
    expect(result.catchUpPolicy).toBe('burst')
    expect(result.queuePolicy).toBe('skip')
    expect(result.maxRuns).toBe(42)
    expect(result.expiryRuns).toBe(100)
    expect(result.expiryDate).toBeUndefined()
  })

  it('converts cron draft', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-2' }),
      prompt: 'cron job',
      scheduleKind: 'cron',
      cronExpression: '  0 9 * * *  '
    }
    const result = draftToCreateRequest(draft)
    expect(result.schedule).toEqual({ kind: 'cron', cronExpression: '0 9 * * *' })
  })

  it('converts at draft', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-3' }),
      prompt: 'one-time job',
      scheduleKind: 'at',
      atTime: '2026-12-25T09:00'
    }
    const result = draftToCreateRequest(draft)
    expect(result.schedule).toEqual({ kind: 'at', atTime: '2026-12-25T09:00' })
  })

  it('omits undefined optional fields', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-4' }),
      prompt: 'test',
      maxRuns: undefined,
      expiryRuns: undefined,
      expiryDate: ''
    }
    const result = draftToCreateRequest(draft)
    expect(result.maxRuns).toBeUndefined()
    expect(result.expiryRuns).toBeUndefined()
    expect(result.expiryDate).toBeUndefined()
  })

  it('includes expiryDate when set', () => {
    const draft: LoopCreateDraft = {
      ...newLoopDraft({ threadTemplateId: 'tpl-5' }),
      prompt: 'test',
      expiryDate: '2027-01-01T00:00'
    }
    const result = draftToCreateRequest(draft)
    expect(result.expiryDate).toBe('2027-01-01T00:00')
  })
})
