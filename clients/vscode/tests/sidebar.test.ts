import { describe, expect, it } from 'vitest'
import { parseSseEvent } from '../src/sse-parser.js'

/* ------------------------------------------------------------------ */
/*  Real Kun SSE shapes — these match what the server emits            */
/* ------------------------------------------------------------------ */

function sseChunk(event: string, data: Record<string, unknown>): string {
  return `event:${event}\ndata:${JSON.stringify(data)}`
}

function dataOnly(data: Record<string, unknown>): string {
  return `data:${JSON.stringify(data)}`
}

describe('parseSseEvent — real Kun event shapes', () => {
  /* ---- assistant_text_delta (nested item.text) ---- */

  it('extracts text from assistant_text_delta with item.text (nested)', () => {
    const result = parseSseEvent(
      sseChunk('assistant_text_delta', {
        kind: 'assistant_text_delta',
        item: { text: 'Hello world' },
        threadId: 't1',
        turnId: 'turn_1'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('assistant_text_delta')
    expect(result!.text).toBe('Hello world')
    expect(result!.threadId).toBe('t1')
    expect(result!.turnId).toBe('turn_1')
  })

  it('falls back to parsed.text when item is absent', () => {
    const result = parseSseEvent(
      dataOnly({
        kind: 'assistant_text_delta',
        text: 'flat text'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.text).toBe('flat text')
  })

  it('falls back to parsed.delta when both item.text and text are absent', () => {
    const result = parseSseEvent(
      dataOnly({
        kind: 'text',
        delta: 'delta text'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.text).toBe('delta text')
  })

  /* ---- assistant_reasoning_delta ---- */

  it('extracts reasoning from assistant_reasoning_delta with item.text', () => {
    const result = parseSseEvent(
      sseChunk('assistant_reasoning_delta', {
        kind: 'assistant_reasoning_delta',
        item: { text: 'Let me think...' }
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('assistant_reasoning_delta')
    expect(result!.text).toBe('Let me think...')
    expect(result!.reasoningText).toBe('Let me think...')
  })

  /* ---- tool_call_ready ---- */

  it('extracts toolName from tool_call_ready', () => {
    const result = parseSseEvent(
      sseChunk('tool_call_ready', {
        kind: 'tool_call_ready',
        toolName: 'bash',
        name: 'bash',
        toolInput: { command: 'ls' }
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('tool_call_ready')
    expect(result!.toolName).toBe('bash')
    expect(result!.name).toBe('bash')
    expect(result!.toolInput).toEqual({ command: 'ls' })
  })

  /* ---- tool_call_completed (collapsible output) ---- */

  it('extracts tool_call_completed with output', () => {
    const result = parseSseEvent(
      sseChunk('tool_call_completed', {
        kind: 'tool_call_completed',
        toolName: 'bash',
        toolOutput: 'file1.txt\nfile2.txt'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('tool_call_completed')
    expect(result!.toolOutput).toBe('file1.txt\nfile2.txt')
  })

  it('extracts tool_call_failed with error', () => {
    const result = parseSseEvent(
      sseChunk('tool_call_failed', {
        kind: 'tool_call_failed',
        toolName: 'bash',
        message: 'Permission denied'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('tool_call_failed')
    expect(result!.message).toBe('Permission denied')
  })

  /* ---- file_change (diff view) ---- */

  it('extracts file_change event for diff', () => {
    const result = parseSseEvent(
      sseChunk('file_change', {
        kind: 'file_change',
        threadId: 't1',
        turnId: 'turn_1',
        eventId: 'change_42',
        toolName: 'write_file',
        fileChange: {
          path: 'src/index.ts',
          original: '// old',
          proposed: '// new'
        }
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('file_change')
    expect(result!.fileChange).toEqual({
      path: 'src/index.ts',
      original: '// old',
      proposed: '// new'
    })
  })

  /* ---- plan_mode_entry (plan visibility) ---- */

  it('extracts plan_mode_entry for plan/execute display', () => {
    const result = parseSseEvent(
      sseChunk('plan_mode_entry', {
        kind: 'plan_mode_entry',
        planEntry: '1. Analyze codebase\n2. Identify issues\n3. Apply fixes'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('plan_mode_entry')
    expect(result!.planEntry).toBe(
      '1. Analyze codebase\n2. Identify issues\n3. Apply fixes'
    )
  })

  /* ---- approval_requested / approval_resolved ---- */

  it('extracts approvalRequested fields', () => {
    const result = parseSseEvent(
      sseChunk('approval_requested', {
        kind: 'approval_requested',
        approvalId: 'apr_1',
        toolName: 'write_file',
        summary: 'Create /tmp/foo.txt'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('approval_requested')
    expect(result!.approvalId).toBe('apr_1')
    expect(result!.summary).toBe('Create /tmp/foo.txt')
    expect(result!.toolName).toBe('write_file')
  })

  it('extracts approval_resolved fields', () => {
    const result = parseSseEvent(
      sseChunk('approval_resolved', {
        kind: 'approval_resolved',
        approvalId: 'apr_1',
        status: 'allowed'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('approval_resolved')
    expect(result!.approvalId).toBe('apr_1')
    expect(result!.status).toBe('allowed')
  })

  /* ---- turn_completed / turn_failed / turn_aborted ---- */

  it('extracts turn_completed', () => {
    const result = parseSseEvent(
      sseChunk('turn_completed', {
        kind: 'turn_completed',
        status: 'completed',
        threadId: 't1',
        turnId: 'turn_1'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('turn_completed')
    expect(result!.status).toBe('completed')
  })

  it('extracts turn_failed with message', () => {
    const result = parseSseEvent(
      sseChunk('turn_failed', {
        kind: 'turn_failed',
        status: 'failed',
        message: 'API error: rate limited'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('turn_failed')
    expect(result!.status).toBe('failed')
    expect(result!.message).toBe('API error: rate limited')
  })

  it('extracts turn_aborted', () => {
    const result = parseSseEvent(
      sseChunk('turn_aborted', {
        kind: 'turn_aborted',
        status: 'aborted'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('turn_aborted')
    expect(result!.status).toBe('aborted')
  })

  /* ---- error ---- */

  it('extracts error with message', () => {
    const result = parseSseEvent(
      sseChunk('error', {
        kind: 'error',
        message: 'Something went wrong'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('error')
    expect(result!.message).toBe('Something went wrong')
  })

  /* ---- raw / fallback ---- */

  it('handles unparseable data gracefully (raw fallback)', () => {
    const result = parseSseEvent('event:message\ndata:not-json-at-all')
    expect(result).not.toBeNull()
    expect(result!.event).toBe('message')
    expect(result!.text).toBe('not-json-at-all')
  })

  it('returns null for empty/whitespace data', () => {
    expect(parseSseEvent('')).toBeNull()
    expect(parseSseEvent('data:')).toBeNull()
    expect(parseSseEvent('  ')).toBeNull()
  })

  /* ---- event: header priority ---- */

  it('prefers event header over parsed.kind', () => {
    const result = parseSseEvent(
      sseChunk('custom_event', {
        kind: 'fallback_kind'
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('custom_event')
    expect(result!.kind).toBe('fallback_kind')
  })

  it('falls back to parsed.kind when no event header', () => {
    const result = parseSseEvent(
      dataOnly({
        kind: 'assistant_text_delta',
        item: { text: 'hello' }
      })
    )
    expect(result).not.toBeNull()
    expect(result!.event).toBe('assistant_text_delta')
  })

  /* ---- multi-line SSE ---- */

  it('handles multi-line SSE chunks', () => {
    const raw =
      'id:42\nevent:assistant_text_delta\ndata:{"kind":"assistant_text_delta","item":{"text":"multi"}}'
    const result = parseSseEvent(raw)
    expect(result).not.toBeNull()
    expect(result!.text).toBe('multi')
  })
})
